import {Suspense} from 'react';
import {LeaderboardsContent} from '../server-views';
export default function Page(){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><LeaderboardsContent/></Suspense>}
