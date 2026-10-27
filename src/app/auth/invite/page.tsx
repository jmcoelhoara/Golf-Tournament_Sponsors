import {Suspense} from 'react';
import {InvitationContent} from '../views';
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 return <main className="shell"><Suspense fallback={<p role="status">Loading invitation…</p>}><InvitationContent searchParams={searchParams}/></Suspense></main>;
}
