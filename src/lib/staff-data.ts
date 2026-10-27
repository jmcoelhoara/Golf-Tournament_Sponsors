import type {SupabaseClient} from '@supabase/supabase-js';
import type {Course,ContestRow,Preset} from './golf';import type {StaffEvent} from './staff';import type {EventImage} from '@/app/admin/MediaPicker';
export async function loadCourses(client:SupabaseClient):Promise<Course[]> {
 const {data,error}=await client.from('courses').select('id,organization_id,name,archived_at,course_tees(id,label,color_hex,archived_at,course_hole_yardages(hole_number,yardage))').order('name').returns<Course[]>();
 if(error)throw new Error(`Unable to load courses: ${error.message}`);return data??[];
}
export async function loadEvents(client:SupabaseClient,history=false,courseId?:string):Promise<StaffEvent[]> {
 let query=client.from('events').select('id,organization_id,name,course_id,course_name,event_date,status,logo_image_id,archived_at').order('event_date',{ascending:false});
 if(!history)query=query.is('archived_at',null).neq('status','archived');if(courseId)query=query.eq('course_id',courseId);
 const {data,error}=await query.returns<StaffEvent[]>();if(error)throw new Error(`Unable to load events: ${error.message}`);return data??[];
}
export async function loadEventDetails(client:SupabaseClient,eventId:string,history=false) {
 let query=client.from('contests').select('id,event_id,name,status,public_token,hole_number,tee_id,tees,hole_yardage,sponsor_banner_id,archived_at,unit,scoring_mode,contest_leaders(leader_name,team_name,value,entry_count)').eq('event_id',eventId).order('name');
 if(!history)query=query.is('archived_at',null);
 const [contests,images,presets]=await Promise.all([query.returns<ContestRow[]>(),client.from('event_images').select('id,kind,label,bucket_id,object_path').eq('event_id',eventId).order('created_at').returns<EventImage[]>(),client.from('contest_presets').select('key,name').eq('active',true).order('sort_order').returns<Preset[]>()]);
 for(const result of [contests,images,presets])if(result.error)throw new Error(`Unable to load event details: ${result.error.message}`);
 return {contests:contests.data??[],images:images.data??[],presets:presets.data??[]};
}
