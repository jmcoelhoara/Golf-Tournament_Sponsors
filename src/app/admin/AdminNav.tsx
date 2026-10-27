import Link from 'next/link';
import {signOut} from './actions';
export default function AdminNav({email,current,isPlatformAdmin=false}:{email:string;current:'events'|'sponsors'|'courses'|'leaderboards'|'access'|'history';isPlatformAdmin?:boolean}) {
 const items=[{key:'events',href:'/admin',label:'Event settings'},{key:'leaderboards',href:'/admin/leaderboards',label:'Leaderboard'},...(isPlatformAdmin?[{key:'courses',href:'/admin/courses',label:'Courses'},{key:'access',href:'/admin/access',label:'Staff access'},{key:'history',href:'/admin/history',label:'Archive history'}]:[])];
 return <div className="topbar no-print"><nav className="admin-nav" aria-label="Staff navigation">{items.map(i=><Link key={i.key} href={i.href} aria-current={current===i.key?'page':undefined} className={current===i.key?'active':''}>{i.label}</Link>)}</nav><div className="topbar-right"><span className="small muted">{email}</span><form action={signOut}><button className="link">Sign out</button></form></div></div>;
}
