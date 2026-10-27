'use server';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
type State={ok?:boolean;message?:string};
export async function confirmStaffInvitation(_state:State,form:FormData):Promise<State>{
 const hash=form.get('token_hash');
 if(form.get('type')!=='invite' || typeof hash!=='string' || !/^[A-Za-z0-9_-]{20,512}$/.test(hash) ||
  form.getAll('token_hash').length!==1 || form.getAll('type').length!==1 || [...form.keys()].some(k=>!['token_hash','type'].includes(k) && !k.startsWith('$ACTION_')))return {ok:false,message:'Invalid staff invitation. Open the original invitation email.'};
 try {
  const client=await createClient();
  const {data,error}=await client.auth.verifyOtp({token_hash:hash,type:'invite'});
  if(error || !data.user || !data.session)return {ok:false,message:'Invitation expired, already used or invalid. Ask the platform administrator for another invitation, or sign in with your existing password.'};
 } catch {return {ok:false,message:'Unable to confirm invitation. Retry from the email; if expired or already used, ask the platform administrator for help.'};}
 // Never accept a caller-selected next/redirect destination or arbitrary OTP type.
 redirect('/auth/set-password');
}
export async function setStaffPassword(_state:State,form:FormData):Promise<State>{
 const password=form.get('password'),confirmation=form.get('confirm_password');
 if(typeof password!=='string' || password.length<12 || password.length>128 || password!==confirmation ||
  form.getAll('password').length!==1 || form.getAll('confirm_password').length!==1 || [...form.keys()].some(k=>!['password','confirm_password'].includes(k) && !k.startsWith('$ACTION_')))return {ok:false,message:'Use matching passwords between 12 and 128 characters.'};
 try {
  const client=await createClient();const auth=await client.auth.getUser();
  if(auth.error || !auth.data.user)return {ok:false,message:'Your session expired. Reopen the invitation or sign in before setting a password.'};
  const {data,error}=await client.auth.updateUser({password});
  if(error || !data.user)return {ok:false,message:'Password could not be saved. Choose a strong password allowed by the site policy and retry. If your session expired, sign in again.'};
 } catch {return {ok:false,message:'Unable to save password. Retry or ask the platform administrator for help.'};}
 redirect('/admin');
}
