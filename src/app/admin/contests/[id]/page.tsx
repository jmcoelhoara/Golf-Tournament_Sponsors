import {Suspense} from 'react';import {EntriesContent} from './entries-view';
export default function Page({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><EntriesContent params={params}/></Suspense>}
