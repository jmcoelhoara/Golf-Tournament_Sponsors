'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {checkInvitationAuthority,createInvitationAdmin,InvitationConfigurationError} from '@/lib/supabase/invitation-admin';

type Result={ok?:boolean;message?:string;partial?:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const partialMessage='Auth/email may have progressed, but staff setup is not confirmed. Reload the course, review selected active tournaments and retry with the same email. Existing grants are retained. Do not delete the account or membership. Check SMTP/rate settings before explicitly requesting another invitation.';
export async function addCourseStaff(_previous: Result, form: FormData): Promise<Result> {
 let authAttempted=false;let accepted=false;
 try {
  const client=await createClient();
  await checkInvitationAuthority(client);
  const allowed=new Set(['course_id','email','event_id','resend']);
  if([...form.keys()].some(k=>!allowed.has(k) && !k.startsWith('$ACTION_')))return {ok:false,message:'Unexpected staff fields. Reload the course form.'};
  const course=form.get('course_id'),rawEmail=form.get('email'),events=form.getAll('event_id');
  if(typeof course!=='string' || !uuid.test(course) || typeof rawEmail!=='string' || form.getAll('course_id').length!==1 || form.getAll('email').length!==1 || events.length>200 || events.some(e=>typeof e!=='string' || !uuid.test(e)))return {ok:false,message:'Invalid course or tournament selection.'};
  const email=rawEmail.trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,message:'Enter a valid staff email.'};
  const args={p_course_id:course,p_email:email,p_event_ids:[...new Set(events as string[])]};
  const preflight=await client.rpc('preflight_staff_invitation',args);
  if(preflight.error || preflight.data?.ok!==true || typeof preflight.data.account_exists!=='boolean')return {ok:false,message:'Staff invitation not authorized or course/tournaments changed. Reload and review the selection.'};
  let existing=preflight.data.account_exists;
  if(!existing || form.get('resend')==='on') {
   const {admin,redirectTo}=await createInvitationAdmin(client);
   authAttempted=true;
   const result=await admin.inviteUserByEmail(email,{redirectTo});
   if(result.error) {
    if(!['email_exists','user_already_exists'].includes(result.error.code??'')) {
     const reason=['over_email_send_rate_limit','over_request_rate_limit'].includes(result.error.code??'')
      ?'Invitation request rate-limited. Wait before retrying. '
      :result.error.code==='email_address_not_authorized'?'Invitation email request rejected. Check SMTP sender configuration and recipient allowlist. '
      :'Invitation email request failed. Check Auth/SMTP configuration. ';
     return {ok:false,partial:true,message:reason+partialMessage};
    }
    existing=true;
   } else {
    if(!result.data.user)return {ok:false,partial:true,message:partialMessage};
    accepted=true;
   }
  }
  // Caller-authenticated transaction repeats fresh authorization and scope validation.
  const completed=await client.rpc('complete_staff_invitation',args);
  if(completed.error || completed.data?.ok!==true)return {ok:false,partial:authAttempted,message:authAttempted?(accepted?'Auth accepted the invitation email request (delivery unconfirmed). ':'')+partialMessage:'Account exists, but staff setup failed. Reload and retry with the same email and reviewed active tournaments. Existing access was not revoked.'};
  revalidatePath(`/admin/courses/${course}`);revalidatePath('/admin/access');
  return {ok:true,message:`Staff access saved. ${accepted?'Auth accepted the invitation email request; delivery is not confirmed.':existing?'Reused existing account; no new invitation accepted. Use the previous invitation or existing password.':''} Only selected tournaments were enabled; zero selections add no new event access. Existing memberships and other grants are retained.`};
 } catch(error) {
  if(authAttempted)return {ok:false,partial:true,message:(accepted?'Auth accepted the invitation email request (delivery unconfirmed). ':'')+partialMessage};
  return {ok:false,message:error instanceof InvitationConfigurationError?error.message:'Unable to authorize or prepare staff invitation. Reload and contact the platform administrator if this persists.'};
 }
}
