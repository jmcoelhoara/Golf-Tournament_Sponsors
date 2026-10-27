import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const {rpc,refresh}=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({rpc})}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
import MediaPicker from './MediaPicker';
import MutationForm from './MutationForm';
it('requires archive confirmation and surfaces a returned mutation failure',async()=>{
 const run=vi.fn().mockRejectedValue(new Error('not_allowed'));
 render(<MutationForm run={run} confirm="Archive this contest? Entries and media are retained." submit="Delete"><p>Contest</p></MutationForm>);
 fireEvent.click(screen.getByRole('button',{name:'Delete'})); expect(run).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(run).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Delete'}));fireEvent.click(screen.getByRole('button',{name:'Confirm archive'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','not_allowed');expect(refresh).not.toHaveBeenCalled();
});
it('reflects the current shared event logo after a server refresh',()=>{
 const images=[{id:'old',kind:'event_logo',label:'Old crest',bucket_id:'event-media',object_path:'org/event/old.png'},{id:'new',kind:'event_logo',label:'New crest',bucket_id:'event-media',object_path:'org/event/new.png'}];
 const props={organizationId:'org',eventId:'event',kind:'event_logo' as const,images};
 const {rerender}=render(<MediaPicker {...props} selectedId="old"/>);
 rerender(<MediaPicker {...props} selectedId="new"/>);
 expect((screen.getByLabelText('Selected event logo') as HTMLSelectElement).value).toBe('new');
 expect(screen.queryByAltText('Old crest')).toBeNull();
 expect(screen.getByAltText('New crest')).toBeTruthy();
});
it('selects exactly one existing event banner and retains the reusable library',async()=>{
 rpc.mockResolvedValue({data:{ok:true},error:null});
 render(<MediaPicker organizationId="org1" eventId="event1" contestId="c1" kind="sponsor_banner" selectedId={null} images={[{id:'banner1',kind:'sponsor_banner',label:'Gold sponsors',bucket_id:'event-media',object_path:'org/event/gold.png'}]}/>);
 fireEvent.change(screen.getByLabelText('Selected sponsor banner'),{target:{value:'banner1'}});fireEvent.click(screen.getByRole('button',{name:'Use selected image'}));
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('set_contest_banner',{p_contest_id:'c1',p_image_id:'banner1'}));
 expect(screen.getByText(/reused/)).toBeTruthy();expect(screen.queryByRole('button',{name:/delete image/i})).toBeNull();
});
