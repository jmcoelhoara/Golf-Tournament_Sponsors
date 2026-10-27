import {Suspense} from 'react';
import {HistoryContent} from '../server-views';
export default function Page(){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><HistoryContent/></Suspense>}
