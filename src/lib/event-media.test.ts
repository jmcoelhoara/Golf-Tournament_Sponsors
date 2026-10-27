import { expect, it, vi } from 'vitest';
import { validateRaster, uploadEventImage, checkedMutation } from './event-media';
const org='11111111-1111-4111-8111-111111111111', event='22222222-2222-4222-8222-222222222222';
it('accepts raster only and rejects oversized or empty uploads',()=>{expect(validateRaster({type:'image/png',size:12})).toBe('png');expect(()=>validateRaster({type:'image/svg+xml',size:12})).toThrow(/PNG/);expect(()=>validateRaster({type:'image/jpeg',size:10485761})).toThrow(/10 MiB/);expect(()=>validateRaster({type:'image/webp',size:0})).toThrow(/empty/)});
it('uploads immutable random event path, registers before selecting and never deletes',async()=>{
 const upload=vi.fn().mockResolvedValue({error:null}), rpc=vi.fn().mockResolvedValueOnce({data:{ok:true,image_id:'image1'},error:null}).mockResolvedValueOnce({data:{ok:true},error:null});
 const storage={from:vi.fn(()=>({upload}))};
 await uploadEventImage({storage,rpc} as never,{organizationId:org,eventId:event,kind:'sponsor_banner',label:'Sponsors',file:new File(['PNG'],'sponsor.svg',{type:'image/png'}),contestId:'contest1'});
 expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^${org}/${event}/[0-9a-f-]{36}\\.png$`)); expect(upload.mock.calls[0][2]).toEqual({upsert:false,contentType:'image/png'});
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['register_event_image','set_contest_banner']);expect(rpc.mock.calls[1][1]).toEqual({p_contest_id:'contest1',p_image_id:'image1'});
});
it.each(['storage','registration','selection'])('surfaces %s failure and retains uploaded objects',async(stage)=>{
 const rpc=vi.fn().mockResolvedValue({data:{ok:false,error:'not_allowed'},error:null});
 if(stage==='selection')rpc.mockResolvedValueOnce({data:{ok:true,image_id:'image1'},error:null});
 const client={rpc,storage:{from:()=>({upload:vi.fn().mockResolvedValue({error:stage==='storage'?{message:'Upload denied'}:null})})}};
 await expect(uploadEventImage(client as never,{organizationId:org,eventId:event,kind:'event_logo',label:'Logo',file:new File(['png'],'logo.png',{type:'image/png'})})).rejects.toThrow(stage==='storage'?'Upload denied':/not_allowed/);
 expect(rpc).toHaveBeenCalledTimes(stage==='storage'?0:stage==='selection'?2:1);
});
it('rejects RPC false/null and direct DML zero-row responses',()=>{
 expect(()=>checkedMutation({data:{ok:false,error:'placements_required'},error:null})).toThrow(/placements/);
 expect(()=>checkedMutation({data:null,error:null})).toThrow(/No change/);
 expect(()=>checkedMutation({data:[],error:null},true)).toThrow(/No change/);
 expect(()=>checkedMutation({data:null,error:{message:'RLS denied'}})).toThrow('RLS denied');
 expect(checkedMutation({data:[{id:'row'}],error:null},true)).toEqual([{id:'row'}]);
});
