import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({rpc: vi.fn()}));
vi.mock('@/lib/supabase/client', () => ({createClient: () => ({rpc, channel: () => ({on() {return this}, subscribe() {return this}}), removeChannel: vi.fn()})}));
import ContestClient from './ContestClient';
import ContestPage from './page';
const payload = {available:true, contest_id:'c1',name:"Men's Closest to the Pin",scoring_mode:'lowest_value',unit:'inches',accepting_entries:true,hole_number:4,hole_yardage:145,tees:'Blue',event:{name:'Charity Open',logo:{bucket:'event-media',path:'org/event/logo.png',alt_text:'Tournament crest'}},sponsor:null,sponsor_banner:{id:'banner1',bucket:'event-media',path:'org/event/banner.png',alt_text:'Our sponsors'},leader:null};
beforeEach(() => {rpc.mockReset();vi.useFakeTimers(); localStorage.clear(); rpc.mockImplementation((name) => Promise.resolve({data: name === 'get_contest_roster' ? [{golfer_id:'g1',display_name:'Jane Green',team_name:'Eagles'}] : payload,error:null}));});
afterEach(() => vi.useRealTimers());
it('shows current event logo and one banner for 5000ms after load, never again on poll', async () => {
 render(<ContestClient token="legacy-token"/>); await act(async()=>{});
 expect(screen.getByAltText('Tournament crest')).toBeTruthy();
 const dialog = screen.getByRole('dialog',{name:'Event sponsors'});
 await act(async()=>{vi.advanceTimersByTime(10000)}); expect(screen.getByRole('dialog')).toBeTruthy();
 fireEvent.load(screen.getByAltText('Our sponsors'));
 await act(async()=>{vi.advanceTimersByTime(4999)}); expect(screen.getByRole('dialog')).toBe(dialog);
 await act(async()=>{vi.advanceTimersByTime(1)}); expect(screen.queryByRole('dialog')).toBeNull();
 await act(async()=>{vi.advanceTimersByTime(30000)}); expect(rpc.mock.calls.filter(([n])=>n==='get_contest_public').length).toBeGreaterThan(1); expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not reopen a dismissed banner when polling clears then replaces its selection', async () => {
 render(<ContestClient token="legacy-token"/>); await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Close sponsor banner'}));
 rpc.mockImplementation((name) => Promise.resolve({data:name==='get_contest_roster'?[]:{...payload,sponsor_banner:null},error:null}));
 await act(async()=>{vi.advanceTimersByTime(30000)});
 rpc.mockImplementation((name) => Promise.resolve({data:name==='get_contest_roster'?[]:{...payload,sponsor_banner:{...payload.sponsor_banner,id:'replacement'}},error:null}));
 await act(async()=>{vi.advanceTimersByTime(30000)});
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('preserves remembered golfer, CTP inches, and the same request UUID on transport retry',async()=>{
 localStorage.setItem('golfer:legacy-token','g1');
 localStorage.setItem('pending:legacy-token:g1','11111111-1111-4111-8111-111111111111');
 let attempts=0;
 rpc.mockImplementation((name)=>Promise.resolve(name==='submit_contest_entry'?(++attempts===1?{data:null,error:{message:'offline'}}:{data:{ok:true,status:'accepted'},error:null}):{data:name==='get_contest_roster'?[{golfer_id:'g1',display_name:'Jane Green',team_name:'Eagles'}]:payload,error:null}));
 render(<ContestClient token="legacy-token"/>);await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Close sponsor banner'}));
 fireEvent.change(screen.getByLabelText('feet'),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText('inches'),{target:{value:'3.5'}});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Submit'}))});
 await act(async()=>{vi.advanceTimersByTime(1500)});
 const submissions=rpc.mock.calls.filter(([name])=>name==='submit_contest_entry');
 expect(submissions).toHaveLength(2);
 expect(submissions[0][1]).toEqual({p_token:'legacy-token',p_golfer_id:'g1',p_value:27.5,p_client_request_id:'11111111-1111-4111-8111-111111111111'});
 expect(submissions[1][1]).toEqual(submissions[0][1]);
 expect(screen.getByText('Entry recorded. Good luck!')).toBeTruthy();
 expect(localStorage.getItem('entered:legacy-token:g1')).toBe('1');
});
it('keeps longest-drive marker claims unmeasured',async()=>{
 localStorage.setItem('golfer:legacy-token','g1');
 rpc.mockImplementation((name)=>Promise.resolve({data:name==='get_contest_roster'?[{golfer_id:'g1',display_name:'Jane Green',team_name:null}]:name==='submit_contest_entry'?{ok:true,status:'accepted'}:{...payload,scoring_mode:'latest_claim',unit:'none',sponsor_banner:null},error:null}));
 render(<ContestClient token="legacy-token"/>);await act(async()=>{});
 expect(screen.queryByText('Your distance to the pin')).toBeNull();
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:"I'm the new leader"}))});
 expect(rpc.mock.calls.find(([name])=>name==='submit_contest_entry')?.[1].p_value).toBeNull();
});
it('updates shared event branding on poll without resetting the selected player',async()=>{
 render(<ContestClient token="legacy-token"/>);await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Close sponsor banner'}));
 fireEvent.change(screen.getByPlaceholderText('Type your name or team'),{target:{value:'Jane'}});
 fireEvent.click(screen.getByRole('button',{name:/Jane Green/}));
 rpc.mockResolvedValue({data:{...payload,event:{...payload.event,logo:{...payload.event.logo,alt_text:'Updated crest',path:'org/event/new.png'}}},error:null});
 await act(async()=>{vi.advanceTimersByTime(30000)});
 expect(screen.getByAltText('Updated crest')).toBeTruthy();
 expect(screen.getByText('Jane Green')).toBeTruthy();
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('retains legacy inline sponsors without treating a sponsor logo as event branding',async()=>{
 rpc.mockImplementation((name)=>Promise.resolve({data:name==='get_contest_roster'?[]:{...payload,event:{name:'Legacy Open',logo:null},sponsor_banner:null,sponsor:{name:'Legacy bank',logo_path:'org/bank.png',website_url:null},event_sponsors:[{name:'Legacy shop',logo_path:null,website_url:null}]},error:null}));
 render(<ContestClient token="legacy-token"/>);await act(async()=>{});
 expect(screen.getByAltText('Legacy bank')).toBeTruthy();
 expect(screen.getByText('Legacy shop')).toBeTruthy();
 expect(screen.queryByAltText('Tournament crest')).toBeNull();
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not start a popup for a banner first selected by a later poll',async()=>{
 rpc.mockImplementation((name)=>Promise.resolve({data:name==='get_contest_roster'?[]:{...payload,sponsor_banner:null},error:null}));
 render(<ContestClient token="legacy-token"/>);await act(async()=>{});
 rpc.mockResolvedValue({data:payload,error:null});
 await act(async()=>{vi.advanceTimersByTime(30000)});
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('starts a fresh visit when navigating to another QR token without a full reload',async()=>{
 async function route(token:string){const child=ContestPage({params:Promise.resolve({token})}).props.children;return child.type(child.props)}
 const {rerender}=render(await route('first-token'));await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Close sponsor banner'}));
 fireEvent.change(screen.getByPlaceholderText('Type your name or team'),{target:{value:'Jane'}});
 fireEvent.click(screen.getByRole('button',{name:/Jane Green/}));
 rerender(await route('second-token'));await act(async()=>{});
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.getByText('Who are you?')).toBeTruthy();
});
it.each(['close','error','escape'])('allows %s bypass without blocking golfer selection', async (method) => {
 render(<ContestClient token="legacy-token"/>); await act(async()=>{});
 if(method==='close') fireEvent.click(screen.getByRole('button',{name:'Close sponsor banner'}));
 if(method==='error') fireEvent.error(screen.getByAltText('Our sponsors'));
 if(method==='escape') fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.change(screen.getByPlaceholderText('Type your name or team'),{target:{value:'Jane'}});
 fireEvent.click(screen.getByRole('button',{name:/Jane Green/}));
 expect(screen.getByText('Your distance to the pin')).toBeTruthy();
});
