"use client";
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkedMutation } from '@/lib/event-media';
import type { StaffEvent } from '@/lib/staff';
import type { Course, Preset } from '@/lib/golf';
import MutationForm from './MutationForm';
export function EventEditor({event,organizations,courses,activeContestCount=0,defaultCourseId}: {event?:StaffEvent;organizations:{id:string;name:string}[];courses:Course[];activeContestCount?:number;defaultCourseId?:string}) {
 const [org,setOrg]=useState(event?.organization_id??organizations[0]?.id??''),[courseId,setCourseId]=useState(event?.course_id??defaultCourseId??'');
 const courseLocked=!!event && activeContestCount>0;
 return <MutationForm submit={event?'Save event settings':'Create event'} disabled={event?.status==='archived'} run={async data=>{
 const name=String(data.get('name')??'').trim(),date=String(data.get('date')??'');
 if(!name || name.length>200 || !date || !courseId)throw new Error('Provide an event title, date and course.');
 if(courseLocked && courseId!==event?.course_id)throw new Error('Archive all nonarchived contests before changing course, or keep the current course.');
 checkedMutation(await createClient().rpc(event?'update_event':'create_event',event?{p_event_id:event.id,p_name:name,p_event_date:date,p_course_id:courseId,p_contest_placements:null}:{p_organization_id:org,p_name:name,p_event_date:date,p_course_id:courseId}));
 }}>
 {!event && <label className="stack">Organization<select className="input" value={org} onChange={e=>{setOrg(e.target.value);setCourseId('')}} required>{organizations.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label>}
 <label className="stack">Event title<input className="input" name="name" defaultValue={event?.name??''} maxLength={200} required/></label>
 <label className="stack">Event date<input className="input" name="date" type="date" defaultValue={event?.event_date??''} required/></label>
 <label className="stack">Course<select className="input" value={courseId} disabled={courseLocked} onChange={e=>setCourseId(e.target.value)} required><option value="">Select a course</option>{courses.filter(c=>c.organization_id===org && (!c.archived_at || c.id===event?.course_id)).map(c=><option key={c.id} value={c.id}>{c.name}{c.archived_at?' (archived)':''}</option>)}</select></label>
 {courseLocked && <p className="small muted">To change course, archive all nonarchived contests first (entries, QR tokens and media are retained), then select the new course and recreate placements. A complete placement remap is required by the database; this editor safely refuses partial remaps.</p>}
 {event && <p className="small muted">Title and date edits retain existing entries and do not rescore them.</p>}
 {!courses.some(c=>c.organization_id===org && !c.archived_at) && <p className="small muted">Ask a platform administrator to configure a course and its tee yardages.</p>}
 </MutationForm>;
}
export function PlacementFields({course,teeId,setTeeId,hole,setHole}: {course:Course|undefined;teeId:string;setTeeId:(v:string)=>void;hole:string;setHole:(v:string)=>void}) {
 const tees=course?.course_tees.filter(t=>!t.archived_at)??[],tee=tees.find(t=>t.id===teeId),placement=tee?.course_hole_yardages.find(y=>String(y.hole_number)===hole);
 return <><label className="stack">Tee<select className="input" value={teeId} onChange={e=>{setTeeId(e.target.value);setHole('')}} required><option value="">Select tee</option>{tees.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
 <label className="stack">Hole<select className="input" value={hole} onChange={e=>setHole(e.target.value)} required><option value="">Select configured hole</option>{[...(tee?.course_hole_yardages??[])].sort((a,b)=>a.hole_number-b.hole_number).map(y=><option key={y.hole_number} value={y.hole_number}>{y.hole_number}</option>)}</select></label>
 <p aria-live="polite">{placement?`${placement.yardage} yards`:'Select a tee and configured hole to see automatic yardage.'}</p></>;
}
export function ContestForm({eventId,course,presets,contest}: {eventId:string;course?:Course;presets:Preset[];contest?:{id:string;tee_id:string|null;hole_number:number|null}}) {
 const [preset,setPreset]=useState(''),[tee,setTee]=useState(contest?.tee_id??''),[hole,setHole]=useState(contest?.hole_number?String(contest.hole_number):'');
 return <MutationForm submit={contest?'Save placement':'Create contest'} run={async()=>{
 if((!contest && !presets.some(p=>p.key===preset)) || !course?.course_tees.some(t=>!t.archived_at && t.id===tee && t.course_hole_yardages.some(y=>String(y.hole_number)===hole)))throw new Error('Select a contest preset, tee and configured hole.');
 checkedMutation(await createClient().rpc(contest?'set_contest_placement':'add_event_contest',contest?{p_contest_id:contest.id,p_tee_id:tee,p_hole_number:Number(hole)}:{p_event_id:eventId,p_preset_key:preset,p_tee_id:tee,p_hole_number:Number(hole)}));
 }}>
 {!contest && <label className="stack">Contest preset<select className="input" value={preset} onChange={e=>setPreset(e.target.value)} required><option value="">Select preset</option>{presets.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>}
 <PlacementFields course={course} teeId={tee} setTeeId={setTee} hole={hole} setHole={setHole}/>
 {contest && <p className="small muted">Placement changes explicitly refresh tee and yardage snapshots. Existing entries and scoring rules are retained.</p>}
 </MutationForm>;
}
