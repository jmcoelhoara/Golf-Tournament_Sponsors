import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {InviteConfirmation,PasswordSetup} from './forms';
type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
export async function InvitationContent({searchParams}:Props){
 const params=await searchParams;
 const valid=Object.keys(params).every(k=>['token_hash','type'].includes(k)) && params.type==='invite' && typeof params.token_hash==='string' && /^[A-Za-z0-9_-]{20,512}$/.test(params.token_hash);
 // GETs (including scanners/prefetch) never contact Auth or consume the token.
 return <InviteConfirmation tokenHash={valid?params.token_hash as string:null}/>;
}
export async function PasswordContent(){
 const client=await createClient();const {data,error}=await client.auth.getUser();
 if(error || !data.user)redirect('/login');
 return <PasswordSetup/>;
}
