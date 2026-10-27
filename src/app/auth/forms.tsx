'use client';
import Link from 'next/link';
import {useActionState} from 'react';
import {confirmStaffInvitation,setStaffPassword} from './actions';
export function InviteConfirmation({tokenHash}:{tokenHash:string|null}){
 const [state,action,pending]=useActionState(confirmStaffInvitation,{});
 return <section className="card"><h1>Staff invitation</h1>
  {tokenHash?<><p>Your invitation is confirmed only when you click Accept invitation. This signs this browser into the invited account, replacing any current session. Continue only if you requested or expected this invitation.</p>
   <form action={action}><input type="hidden" name="token_hash" value={tokenHash}/><input type="hidden" name="type" value="invite"/><button className="btn" disabled={pending}>{pending?'Confirming…':'Accept invitation'}</button></form></>:<p>Open the complete staff invitation link from your email. If it expired or was already used, ask the platform administrator for help.</p>}
  {state.message && <p role="alert" className="result error">{state.message}</p>}
  <p><Link href="/login">Staff sign in</Link></p>
 </section>;
}
export function PasswordSetup(){
 const [state,action,pending]=useActionState(setStaffPassword,{});
 return <section className="card"><h1>Choose your password</h1><p>Use 12–128 characters. After saving, only explicitly enabled tournaments will appear in your dashboard.</p>
  <form action={action}><fieldset disabled={pending}>
   <label className="stack">New password<input className="input" type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
   <label className="stack">Confirm password<input className="input" type="password" name="confirm_password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
   <button className="btn">{pending?'Saving…':'Save password'}</button>
  </fieldset></form>
  {state.message && <p role="alert" className="result error">{state.message}</p>}
 </section>;
}
