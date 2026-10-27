import {Suspense} from 'react';
import {AccessContent} from '../server-views';
export default function Page(){return <Suspense fallback={<main className="shell"><p role="status">Loading…</p></main>}><AccessContent/></Suspense>}
