"use client";
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkedMutation, eventImageUrl, uploadEventImage } from '@/lib/event-media';
import MutationForm from './MutationForm';
export type EventImage = {id:string;kind:string;label:string;bucket_id:string;object_path:string};
type MediaPickerProps = {organizationId:string;eventId:string;contestId?:string;kind:'event_logo'|'sponsor_banner';selectedId:string|null;images:EventImage[]};
export default function MediaPicker(props:MediaPickerProps) {
 return <MediaPickerForm key={`${props.eventId}:${props.contestId??'logo'}:${props.selectedId??'none'}`} {...props}/>;
}
function MediaPickerForm({organizationId,eventId,contestId,kind,selectedId,images}:MediaPickerProps) {
 const [selected,setSelected]=useState(selectedId??'');const list=images.filter(i=>i.kind===kind);const current=list.find(i=>i.id===selected);const title=kind==='event_logo'?'event logo':'sponsor banner';
 return <section className="media-picker" aria-label={kind==='event_logo'?'Event logo':'Upload sponsors'}><h3>{kind==='event_logo'?'Event logo':'Upload sponsors / reuse banner'}</h3>
 <p className="small muted">{kind==='event_logo'?'Shared across all contest pages and new printouts.':'One selected banner per contest. Images can be reused by other contests in this event.'} Uploaded images are retained in this event library.</p>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {current && <img className="media-preview" src={eventImageUrl({bucket:current.bucket_id,path:current.object_path,alt_text:current.label})??undefined} alt={current.label}/>}
 <MutationForm submit="Use selected image" run={async()=>{checkedMutation(await createClient().rpc(kind==='event_logo'?'set_event_logo':'set_contest_banner',kind==='event_logo'?{p_event_id:eventId,p_image_id:selected||null}:{p_contest_id:contestId,p_image_id:selected||null}))}}>
 <label className="stack">Selected {title}<select className="input" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">None</option>{list.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</select></label>
 </MutationForm>
 <MutationForm submit="Upload and select" run={async data=>{const file=data.get('image');if(!(file instanceof File))throw new Error('Choose an image.');await uploadEventImage(createClient(),{organizationId,eventId,contestId,kind,label:String(data.get('label')??''),file})}}>
 <label className="stack">Image label<input className="input" name="label" required maxLength={200}/></label>
 <label className="stack">Upload {title}<input className="input" type="file" name="image" required accept="image/png,image/jpeg,image/webp"/></label>
 <p className="small muted">PNG, JPEG or WebP, up to 10 MiB. A failed registration retains the uploaded object for administrator review; retry with a new upload.</p>
 </MutationForm></section>;
}
