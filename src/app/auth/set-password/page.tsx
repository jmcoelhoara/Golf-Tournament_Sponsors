import {Suspense} from 'react';
import {PasswordContent} from '../views';
export default function Page(){return <main className="shell"><Suspense fallback={<p role="status">Checking session…</p>}><PasswordContent/></Suspense></main>}
