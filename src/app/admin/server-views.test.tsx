import { render,screen } from '@testing-library/react';import {expect,it,vi,beforeEach} from 'vitest';
const {requireStaff,requireEvent,client,queries}=vi.hoisted(()=>({requireStaff:vi.fn(),requireEvent:vi.fn(),client:{from:vi.fn()},queries:[] as string[]}));
vi.mock('@/lib/staff',()=>({requireStaff,requireEvent}));vi.mock('./actions',()=>({signOut:vi.fn()}));vi.mock('@/lib/site-url',()=>({siteUrl:async()=> 'https://golf.example'}));vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not_found')},useRouter:()=>({refresh:vi.fn()})}));
import {EventSettingsContent,EventDetailContent,LeaderboardsContent,CourseListContent,CourseContent,AccessContent,HistoryContent,EventLeaderboardContent,PrintContent} from './server-views';
import LegacySponsorsPage from './sponsors/page';
vi.mock('@/lib/supabase/server',()=>({createClient:()=>{throw new Error('legacy_read_before_platform_guard')}}));
it('requires platform authority before reading the retired organization-wide sponsor screen',async()=>{
 requireStaff.mockRejectedValueOnce(new Error('platform_denied'));
 const content=LegacySponsorsPage().props.children;
 await expect(content.type()).rejects.toThrow('platform_denied');
 expect(requireStaff).toHaveBeenCalledWith(true);
});
it('retains legacy sponsor display without destructive organization-wide image controls',async()=>{
 requireStaff.mockResolvedValue({client,user:{email:'troy@test'},context:{is_platform_admin:true,creation_organizations:[]}});
 client.from.mockReturnValue({select:()=>({order:()=>({returns:()=>Promise.resolve({data:[{id:'org',name:'Club',sponsors:[{id:'s1',organization_id:'org',name:'Legacy bank',logo_path:'org/bank.png',website_url:null}]}],error:null})})})});
 render(await LegacySponsorsPage().props.children.type());
 expect(screen.getByText('Legacy bank')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Delete'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Replace logo'})).toBeNull();
 expect(screen.getByText(/event-local sponsor banners/i)).toBeTruthy();
});
const event={id:'event1',name:'Granted Charity',organization_id:'org',course_id:'course1',event_date:'2026-11-05',status:'draft',logo_image_id:null,archived_at:null};
beforeEach(()=>{requireStaff.mockReset();requireEvent.mockReset();queries.length=0;requireStaff.mockResolvedValue({client,user:{email:'staff@test'},context:{is_platform_admin:false,creation_organizations:[]}});requireEvent.mockResolvedValue(event);client.from.mockImplementation((table:string)=>{queries.push(table);const result={data:table==='events'?[event]:[],error:null};const q={select:()=>q,order:()=>q,is:()=>q,neq:()=>q,eq:()=>q,returns:()=>Promise.resolve(result),then:(resolve:(value:unknown)=>void)=>Promise.resolve(result).then(resolve)};return q})});
it('loads granted event settings through user-scoped SELECT and keeps no-grants users logged in',async()=>{render(await EventSettingsContent());expect(screen.getByRole('link',{name:'Granted Charity'})).toBeTruthy();expect(queries).toContain('events');expect(queries).not.toContain('organization_members');expect(screen.queryByRole('link',{name:'Staff access'})).toBeNull()});
it('makes course-scoped event pages discoverable without granting catalog editing',async()=>{
 client.from.mockImplementation((table:string)=>{const result={data:table==='courses'?[{id:'course1',organization_id:'org',name:'North Course',archived_at:null,course_tees:[]}]:[],error:null};const q={select:()=>q,order:()=>q,is:()=>q,neq:()=>q,eq:()=>q,returns:()=>Promise.resolve(result)};return q});
 render(await EventSettingsContent());
 expect(screen.getByRole('link',{name:'Events at North Course'}).getAttribute('href')).toBe('/admin/courses/course1');
 expect(screen.queryByRole('link',{name:'Courses'})).toBeNull();
});
it('loads an event detail only after its RLS event read and exposes fixed contest creation plus shared logo',async()=>{render(await EventDetailContent({params:Promise.resolve({id:'event1'})}));expect(requireEvent).toHaveBeenCalledWith(client,'event1');expect(screen.getByRole('heading',{name:'Granted Charity'})).toBeTruthy();expect(screen.getByLabelText('Event logo')).toBeTruthy();expect(screen.getByLabelText('Contest preset')).toBeTruthy()});
it('refuses archived event history on a direct ordinary-staff settings URL',async()=>{
 requireEvent.mockResolvedValue({...event,status:'archived',archived_at:'2026-10-26T00:00:00Z'});
 await expect(EventDetailContent({params:Promise.resolve({id:'event1'})})).rejects.toThrow('not_found');
 expect(queries).not.toContain('event_images');
});
it('keeps platform operational contests separate from an explicit retained-history view',async()=>{
 requireStaff.mockResolvedValue({client,user:{email:'troy@test'},context:{is_platform_admin:true,creation_organizations:[]}});
 const active={id:'c1',event_id:'event1',name:'Active drive',status:'open',public_token:'legacy',hole_number:7,tee_id:null,tees:'Blue',hole_yardage:420,sponsor_banner_id:null,archived_at:null,unit:'none',scoring_mode:'latest_claim',contest_leaders:null};
 const contests=[active,{...active,id:'c2',name:'Archived drive',archived_at:'2026-10-26T00:00:00Z'}];
 client.from.mockImplementation((table:string)=>{const result={data:table==='contests'?contests:[],error:null};const q={select:()=>q,order:()=>q,is:()=>q,eq:()=>q,returns:()=>Promise.resolve(result),then:(resolve:(value:unknown)=>void)=>Promise.resolve(result).then(resolve)};return q});
 const {unmount}=render(await EventDetailContent({params:Promise.resolve({id:'event1'})}));
 expect(screen.getByRole('region',{name:'Active drive'})).toBeTruthy();
 expect(screen.queryByRole('region',{name:'Archived drive'})).toBeNull();
 expect(screen.getByRole('link',{name:'View retained contest history'}).getAttribute('href')).toBe('/admin/events/event1?history=1');
 unmount();
 render(await EventDetailContent({params:Promise.resolve({id:'event1'}),searchParams:Promise.resolve({history:'1'})}));
 expect(screen.getByRole('region',{name:'Archived drive'})).toBeTruthy();
});
it('builds leaderboard navigation from the same granted-event SELECT',async()=>{render(await LeaderboardsContent());expect(screen.getByRole('link',{name:'Open leaderboard for Granted Charity'}).getAttribute('href')).toBe('/admin/events/event1/leaderboard')});
it.each([['courses',CourseListContent],['access',AccessContent],['history',HistoryContent]])('requires server platform context for direct %s route',async(_name,view)=>{requireStaff.mockRejectedValueOnce(new Error('platform_denied'));await expect(view()).rejects.toThrow('platform_denied');expect(requireStaff).toHaveBeenCalledWith(true)});
it('renders course-specific granted events but no ordinary-staff catalog editor',async()=>{client.from.mockImplementation((table:string)=>{const result={data:table==='courses'?[{id:'course1',organization_id:'org',name:'North Course',archived_at:null,course_tees:[]}]:[event],error:null};const q={select:()=>q,order:()=>q,is:()=>q,neq:()=>q,eq:()=>q,returns:()=>Promise.resolve(result)};return q});render(await CourseContent({params:Promise.resolve({id:'course1'})}));expect(screen.getByRole('heading',{name:'North Course'})).toBeTruthy();expect(screen.getByRole('link',{name:'Granted Charity'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Create tee'})).toBeNull()});
it('shows an authenticated event leaderboard including closed and draft contests',async()=>{render(await EventLeaderboardContent({params:Promise.resolve({id:'event1'})}));expect(requireEvent).toHaveBeenCalledWith(client,'event1');expect(screen.getByRole('heading',{name:'Granted Charity leaderboard'})).toBeTruthy()});
it('reads the updated shared event logo for every newly opened draft print sheet',async()=>{
 const contest={id:'c1',event_id:'event1',name:'Long Drive',hole_number:7,tees:'Blue',hole_yardage:155,public_token:'legacy-token',archived_at:null};
 let currentLogo='first-logo';
 requireEvent.mockImplementation(async()=>({...event,logo_image_id:currentLogo}));
 client.from.mockImplementation((table:string)=>{let rowId='';const q={select:()=>q,eq:(field:string,value:string)=>{if(field==='id')rowId=value;return q},maybeSingle:()=>Promise.resolve({data:table==='contests'?{...contest,id:rowId}:{id:currentLogo,bucket_id:'event-media',object_path:`org/event/${currentLogo}.png`,label:currentLogo},error:null})};return q});
 const {unmount}=render(await PrintContent({params:Promise.resolve({id:'c1'})}));
 expect(screen.getByAltText('first-logo')).toBeTruthy();unmount();
 currentLogo='replacement-logo';
 for(const id of ['c1','c2']){
   const view=render(await PrintContent({params:Promise.resolve({id})}));
   expect(screen.getByAltText('replacement-logo')).toBeTruthy();
   expect(screen.queryByAltText('first-logo')).toBeNull();view.unmount();
 }
});
it('prints draft contests with the parent current logo and original QR token through the user client',async()=>{const contest={id:'c1',event_id:'event1',name:'Long Drive',hole_number:7,tees:'Blue',hole_yardage:155,public_token:'legacy-token',archived_at:null};requireEvent.mockResolvedValue({...event,logo_image_id:'current-logo'});client.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>Promise.resolve({data:table==='contests'?contest:{id:'current-logo',bucket_id:'event-media',object_path:'org/event/logo.png',label:'Current logo'},error:null})};return q});render(await PrintContent({params:Promise.resolve({id:'c1'})}));expect(screen.getByAltText('Current logo')).toBeTruthy();expect(screen.getByText('Hole 7')).toBeTruthy();expect(screen.getByRole('link',{name:'Open player page'}).getAttribute('href')).toBe('https://golf.example/c/legacy-token')});
