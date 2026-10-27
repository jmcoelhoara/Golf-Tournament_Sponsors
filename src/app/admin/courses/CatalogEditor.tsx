"use client";
import {createClient} from '@/lib/supabase/client';import {checkedMutation} from '@/lib/event-media';import type {Course,Tee,Yardage} from '@/lib/golf';import {validateTee,validateYardage} from '@/lib/catalog-validation';import MutationForm from '../MutationForm';
export function CourseEditor({organizations,course}:{organizations:{id:string;name:string}[];course?:Course}) {
 return <MutationForm submit={course?'Save course name':'Create course'} disabled={!!course?.archived_at} run={async data=>{const name=String(data.get('name')??'').trim();if(!name || name.length>200)throw new Error('Course name must be 1–200 characters.');const db=createClient().from('courses');checkedMutation(await (course?db.update({name}).eq('id',course.id):db.insert({organization_id:String(data.get('organization_id')),name})).select('id'),true)}}>
 {!course && <label className="stack">Organization<select className="input" name="organization_id" required defaultValue={organizations[0]?.id??''}>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
 <label className="stack">Course name<input name="name" className="input" defaultValue={course?.name??''} required maxLength={200}/></label></MutationForm>;
}
export function TeeEditor({courseId,tee}:{courseId:string;tee?:Tee}) {
 return <MutationForm submit={tee?'Save tee':'Create tee'} disabled={!!tee?.archived_at} run={async data=>{const values=validateTee(String(data.get('label')??''),String(data.get('color')??'')),db=createClient().from('course_tees');checkedMutation(await (tee?db.update(values).eq('id',tee.id):db.insert({course_id:courseId,...values})).select('id'),true)}}>
 <label className="stack">Tee label<input className="input" name="label" required maxLength={50} defaultValue={tee?.label??''}/></label><label className="stack">Tee color (hex, optional)<input className="input" name="color" defaultValue={tee?.color_hex??''} placeholder="#ad6f32"/></label></MutationForm>;
}
export function YardageEditor({teeId,yardage}:{teeId:string;yardage?:Yardage}) {
 return <MutationForm submit="Save yardage" run={async data=>{const values=validateYardage(String(data.get('hole')??yardage?.hole_number??''),String(data.get('yards')??''));checkedMutation(await createClient().from('course_hole_yardages').upsert({tee_id:teeId,...values},{onConflict:'tee_id,hole_number'}).select('tee_id'),true)}}>
 <label className="stack">Hole number<input className="input" type="number" name="hole" min={1} max={36} step={1} defaultValue={yardage?.hole_number??''} readOnly={!!yardage} required/></label><label className="stack">Yardage (yards)<input className="input" type="number" name="yards" min={1} max={32767} step={1} defaultValue={yardage?.yardage??''} required/></label></MutationForm>;
}
