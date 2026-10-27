"use client";
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function MutationForm({run,submit,children,confirm,disabled=false}: {run:(data:FormData)=>Promise<unknown>;submit:string;children?:React.ReactNode;confirm?:string;disabled?:boolean}) {
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[confirming,setConfirming]=useState(false);
 const form=useRef<HTMLFormElement>(null);const router=useRouter();
 async function execute(data:FormData){setPending(true);setError('');setDone(false);try{await run(data);setDone(true);setConfirming(false);router.refresh()}catch(e){setError(e instanceof Error?e.message:'Unable to save. Try again.')}finally{setPending(false)}}
 return <form ref={form} onSubmit={e=>{e.preventDefault();if(confirm){setConfirming(true);return}void execute(new FormData(e.currentTarget))}}>
  <fieldset disabled={pending || disabled}>{children}<button className="btn small" type="submit">{pending?'Saving…':submit}</button></fieldset>
  {confirming && <div role="alertdialog" aria-label="Confirm archive" className="result"><p>{confirm}</p><button className="btn small danger" type="button" disabled={pending} onClick={()=>{if(form.current)void execute(new FormData(form.current))}}>Confirm archive</button> <button type="button" className="btn small secondary" onClick={()=>setConfirming(false)}>Cancel</button></div>}
  {error && <p role="alert" className="result error">{error}</p>}{done && <p role="status" className="small">Saved.</p>}
 </form>;
}
