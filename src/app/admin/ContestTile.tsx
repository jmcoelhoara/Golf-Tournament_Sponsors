import Link from 'next/link';
import type {StaffEvent} from '@/lib/staff';import type {ContestRow,Course} from '@/lib/golf';import {formatValue} from '@/lib/format';
import {ContestForm} from './EventEditor';import MediaPicker,{type EventImage} from './MediaPicker';import RpcForm from './RpcForm';
export default function ContestTile({contest:c,event,course,images}:{contest:ContestRow;event:StaffEvent;course?:Course;images:EventImage[]}) {
 const archived=!!c.archived_at || !!event.archived_at || event.status==='archived';const leader=c.contest_leaders;
 return <section className="contest-tile" aria-label={c.name}><div className="tile-head"><h3>{c.name}</h3><span className="badge">{c.archived_at?'archived':c.status}</span></div><p>{[c.hole_number?`Hole ${c.hole_number}`:null,c.tees?`${c.tees} tees`:null,c.hole_yardage?`${c.hole_yardage} yards`:null].filter(Boolean).join(' · ')}</p>
 <p className="small">Leader: {leader?.leader_name??'—'}{leader?.value!=null && c.scoring_mode!=='latest_claim'?` (${formatValue(leader.value,c.unit)})`:''} · {leader?.entry_count??0} entries</p>
 <div className="tile-actions wrap"><Link href={`/admin/contests/${c.id}`} className="btn small secondary">Entries</Link><Link href={`/admin/contests/${c.id}/print`} className="btn small secondary">Print</Link><Link href={`/c/${c.public_token}`} className="btn small secondary" target="_blank">Player page</Link>
 {!archived && <><RpcForm rpc="set_contest_status" args={{p_contest_id:c.id,p_status:c.status==='open'?'closed':'open'}} submit={c.status==='open'?'Close':'Open'}/><RpcForm rpc="archive_contest" args={{p_contest_id:c.id}} submit="Delete" confirm="Archive this contest? Entries, QR tokens and shared event media are retained; it will stop accepting entries and disappear from operational pages."/></>}</div>
 {!archived && <><details><summary>Edit placement</summary><ContestForm eventId={event.id} contest={c} course={course} presets={[]}/></details><details><summary>Upload sponsors / reuse banner</summary><MediaPicker organizationId={event.organization_id} eventId={event.id} contestId={c.id} kind="sponsor_banner" selectedId={c.sponsor_banner_id} images={images}/></details></>}
 </section>;
}
