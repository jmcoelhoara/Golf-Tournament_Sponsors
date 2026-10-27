import {Suspense} from 'react';
import {EventLeaderboardContent} from '../../../server-views';
export default function Page({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><EventLeaderboardContent params={params}/></Suspense>}
