import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase/client',()=>({createClient:()=>({rpc})}));vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import { EventEditor, ContestForm } from './EventEditor';
const courses=[{id:'course1',organization_id:'org',name:'North Course',archived_at:null,course_tees:[{id:'tee1',label:'Blue',color_hex:'#0000ff',archived_at:null,course_hole_yardages:[{hole_number:7,yardage:155}]}]},{id:'course2',organization_id:'org',name:'South Course',archived_at:null,course_tees:[{id:'tee2',label:'Blue',color_hex:'#0000ff',archived_at:null,course_hole_yardages:[{hole_number:7,yardage:210}]}]}];
const event={id:'event1',organization_id:'org',course_id:'course1',course_name:'North Course',name:'Charity',event_date:'2026-11-01',status:'draft',logo_image_id:null,archived_at:null};
beforeEach(()=>rpc.mockReset().mockResolvedValue({data:{ok:true},error:null}));
it('edits event title and date without silently changing course with existing contests',async()=>{
 render(<EventEditor event={event} organizations={[{id:'org',name:'Club'}]} courses={courses} activeContestCount={2}/>);
 expect((screen.getByLabelText('Course') as HTMLSelectElement).disabled).toBe(true);expect(screen.getByText(/archive all nonarchived contests/i)).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Event title'),{target:{value:'Charity 2026'}});fireEvent.change(screen.getByLabelText('Event date'),{target:{value:'2026-11-02'}});fireEvent.click(screen.getByRole('button',{name:'Save event settings'}));
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('update_event',{p_event_id:'event1',p_name:'Charity 2026',p_event_date:'2026-11-02',p_course_id:'course1',p_contest_placements:null}));
});
it('creates an event in a selected creation organization and course',async()=>{
 render(<EventEditor organizations={[{id:'org',name:'Club'}]} courses={courses}/>);
 fireEvent.change(screen.getByLabelText('Event title'),{target:{value:'New Open'}});fireEvent.change(screen.getByLabelText('Event date'),{target:{value:'2026-11-05'}});fireEvent.change(screen.getByLabelText('Course'),{target:{value:'course2'}});fireEvent.click(screen.getByRole('button',{name:'Create event'}));
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('create_event',{p_organization_id:'org',p_name:'New Open',p_event_date:'2026-11-05',p_course_id:'course2'}));
});
it('requires explicit preset, tee and hole; displays course-specific automatic yardage and submits no scoring overrides',async()=>{
 render(<ContestForm eventId="event1" course={courses[1]} presets={[{key:'mens-closest-to-pin',name:"Men's Closest to the Pin"}]}/>);
 expect((screen.getByLabelText('Hole') as HTMLSelectElement).value).toBe('');
 fireEvent.change(screen.getByLabelText('Contest preset'),{target:{value:'mens-closest-to-pin'}});fireEvent.change(screen.getByLabelText('Tee'),{target:{value:'tee2'}});fireEvent.change(screen.getByLabelText('Hole'),{target:{value:'7'}});
 expect(screen.getByText('210 yards')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Create contest'}));
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('add_event_contest',{p_event_id:'event1',p_preset_key:'mens-closest-to-pin',p_tee_id:'tee2',p_hole_number:7}));
});
it('shows invalid placement errors instead of inventing missing yardages',async()=>{render(<ContestForm eventId="event1" course={courses[0]} presets={[]}/>);fireEvent.submit(screen.getByRole('button',{name:'Create contest'}).closest('form')!);expect(await screen.findByRole('alert')).toHaveProperty('textContent','Select a contest preset, tee and configured hole.');expect(rpc).not.toHaveBeenCalled()});
