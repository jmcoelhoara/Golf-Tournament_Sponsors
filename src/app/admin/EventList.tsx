import Link from 'next/link';
import type {StaffEvent} from '@/lib/staff';
export default function EventList({events,leaderboard=false,history=false}:{events:StaffEvent[];leaderboard?:boolean;history?:boolean}) {
 const visible=events.filter(e=>history || (!e.archived_at && e.status!=='archived'));
 if(!visible.length)return <p className="card muted">No enabled events. You are signed in; ask the platform administrator to grant event access, or create an event below if available.</p>;
 return <div className="event-list">{visible.map(e=><section key={e.id} className="card"><h2><Link href={`/admin/events/${e.id}`}>{e.name}</Link></h2><p className="small muted">{[e.course_name,e.event_date,e.status].filter(Boolean).join(' · ')}</p>{leaderboard && <Link href={`/admin/events/${e.id}/leaderboard`} aria-label={`Open leaderboard for ${e.name}`}>Open leaderboard →</Link>}</section>)}</div>;
}
