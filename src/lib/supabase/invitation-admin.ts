import 'server-only';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export class InvitationConfigurationError extends Error {}
export async function checkInvitationAuthority(client:SupabaseClient) {
 const {data,error}=await client.auth.getUser();
 if(error || !data.user)throw new Error('not_allowed');
 const context=await client.rpc('get_staff_context');
 if(context.error || context.data?.is_platform_admin!==true)throw new Error('not_allowed');
}

// Deliberately separate from the SSR client: no cookies, storage or forwarded user session.
// Recheck fresh DB platform authority BEFORE even reading a privileged configuration value.
export async function createInvitationAdmin(client:SupabaseClient) {
 await checkInvitationAuthority(client);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key?.trim())throw new InvitationConfigurationError('Staff invitations require server-only SUPABASE_SERVICE_ROLE_KEY configuration.');
 let origin:URL;
 try {
  origin=new URL(process.env.STAFF_INVITE_SITE_URL??'');
  if(origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash ||
   !(origin.protocol==='https:' || (origin.protocol==='http:' && ['localhost','127.0.0.1'].includes(origin.hostname))))throw new Error();
 } catch {throw new InvitationConfigurationError('Configure STAFF_INVITE_SITE_URL as the trusted app origin (HTTPS in production, no path).');}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!url)throw new InvitationConfigurationError('Configure the Supabase project URL before inviting staff.');
 return {
  admin:createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}}).auth.admin,
  redirectTo:`${origin.origin}/auth/invite`,
 };
}
