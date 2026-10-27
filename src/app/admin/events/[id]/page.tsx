import {Suspense} from 'react';
import {EventDetailContent} from '../../server-views';
export default function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{history?:string}>}){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><EventDetailContent params={params} searchParams={searchParams}/></Suspense>}
