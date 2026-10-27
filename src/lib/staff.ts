import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
export type StaffContext={is_platform_admin:boolean;creation_organizations:{id:string;name:string}[]};
export type StaffEvent={id:string;organization_id:string;name:string;course_id:string|null;course_name:string|null;event_date:string|null;status:string;logo_image_id:string|null;archived_at:string|null};
export async function requireStaff(platformOnly=false) {
 const client=await createClient();const {data:auth,error:authError}=await client.auth.getUser();
 if(authError || !auth.user)redirect('/login');
 const {data,error}=await client.rpc('get_staff_context');
 if(error)throw new Error(`Unable to load staff access: ${error.message}`);
 if(!data || typeof data.is_platform_admin!=='boolean' || !Array.isArray(data.creation_organizations))throw new Error('Unable to verify staff access. Reload or contact the platform administrator.');
 const context=data as StaffContext;
 if(platformOnly && !context.is_platform_admin)notFound();
 return {client,user:auth.user,context};
}
export async function requireEvent(client:SupabaseClient,id:string):Promise<StaffEvent> {
 const {data,error}=await client.from('events').select('id,organization_id,name,course_id,course_name,event_date,status,logo_image_id,archived_at').eq('id',id).maybeSingle();
 if(error)throw new Error(`Unable to load event: ${error.message}`);if(!data)notFound();return data as StaffEvent;
}
