"use client";
import {createClient} from '@/lib/supabase/client';
import {checkedMutation} from '@/lib/event-media';
import MutationForm from './MutationForm';
export default function RpcForm({rpc,args,submit,confirm,children,disabled}:{rpc:string;args:Record<string,unknown>;submit:string;confirm?:string;children?:React.ReactNode;disabled?:boolean}) {
 return <MutationForm submit={submit} confirm={confirm} disabled={disabled} run={async()=>checkedMutation(await createClient().rpc(rpc,args))}>{children}</MutationForm>;
}
