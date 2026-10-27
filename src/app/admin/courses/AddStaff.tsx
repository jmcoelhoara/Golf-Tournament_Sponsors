'use client';
import {useActionState} from 'react';
import type {StaffEvent} from '@/lib/staff';
import {addCourseStaff} from '../invitation-actions';

export default function AddStaff({courseId,courseName,clubName,events}:{courseId:string;courseName:string;clubName:string;events:StaffEvent[]}) {
 const [state,action,pending]=useActionState(addCourseStaff,{});
 const choices=events.filter(e=>e.course_id===courseId && !e.archived_at && e.status!=='archived');
 return <section className="card"><details><summary>Add staff</summary>
  <p>Club: {clubName} · Course: {courseName}</p>
  <p>New staff choose their own password from the invitation email. No initial password is created or shared. Existing accounts keep their password and membership role.</p>
  <p>Enable only selected tournaments at this course. Zero selections add organization membership but no new event access. Existing grants elsewhere are retained, not revoked.</p>
  <form action={action}><fieldset disabled={pending}>
   <input type="hidden" name="course_id" value={courseId}/>
   <label className="stack">Staff email<input className="input" type="email" name="email" autoComplete="email" maxLength={254} required/></label>
   <fieldset><legend>Tournaments to enable</legend>
    {choices.length===0 && <p>No active tournaments at this course. You can still invite with no event access.</p>}
    {choices.map(e=><label className="stack" key={e.id}><span><input type="checkbox" name="event_id" value={e.id} aria-label={e.name}/> {e.name}</span><span className="small muted">{e.event_date??'No date'} · {e.status}</span></label>)}
   </fieldset>
   <label className="stack"><span><input type="checkbox" name="resend"/> Request another invitation for an existing pending account</span><span className="small muted">Only when needed (for example, an expired link). May invalidate an earlier invite. Confirmed accounts use their existing password; this does not reset passwords or send a recovery email.</span></label>
   <button className="btn" type="submit">{pending?'Saving staff…':'Invite / save staff'}</button>
  </fieldset></form>
  {state.message && <p className={`result ${state.ok?'':'error'}`} role={state.ok?'status':'alert'}>{state.message}</p>}
 </details></section>;
}
