import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { formatValue, type Unit } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { logoUrl } from "@/lib/logo";
import AdminNav from "./AdminNav";
import AutoSubmitSelect from "./AutoSubmitSelect";
import {
  addEventSponsor, moveEventSponsor, removeEventSponsor,
  setContestSponsor, setContestStatus, setEventStatus,
} from "./actions";

type ContestRow = {
  id: string; name: string; status: "draft" | "open" | "closed"; public_token: string;
  hole_number: number | null; unit: Unit; scoring_mode: string; sponsor_id: string | null;
  contest_leaders: { leader_name: string | null; team_name: string | null; value: number | null; entry_count: number } | null;
};
type EventRow = {
  id: string; name: string; course_name: string | null; event_date: string | null;
  status: "draft" | "live" | "closed" | "archived"; organization_id: string;
  organizations: { name: string } | null;
  contests: ContestRow[];
  event_sponsors: { id: string; sponsor_id: string; sort_order: number; created_at: string }[];
};
type SponsorRow = { id: string; organization_id: string; name: string; logo_path: string | null };

export default function AdminPage() {
  return (
    <Suspense fallback={<main className="shell"><div className="card muted">Loading…</div></main>}>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: events, error } = await supabase
    .from("events")
    .select(`id, name, course_name, event_date, status, organization_id,
      organizations ( name ),
      event_sponsors ( id, sponsor_id, sort_order, created_at ),
      contests ( id, name, status, public_token, hole_number, unit, scoring_mode, sponsor_id,
        contest_leaders ( leader_name, team_name, value, entry_count ) )`)
    .order("event_date", { ascending: false })
    .returns<EventRow[]>();

  const { data: sponsors } = await supabase
    .from("sponsors").select("id, organization_id, name, logo_path").order("name")
    .returns<SponsorRow[]>();
  const sponsorById = new Map((sponsors ?? []).map((s) => [s.id, s]));

  const base = await siteUrl();
  const qrs = new Map<string, string>();
  for (const e of events ?? []) {
    for (const c of e.contests) {
      qrs.set(c.id, await QRCode.toDataURL(`${base}/c/${c.public_token}`, { margin: 1, width: 240 }));
    }
  }

  return (
    <main className="shell wide">
      <AdminNav email={auth.user.email ?? ""} current="events" />

      {error && <div className="result error">Couldn&apos;t load events: {error.message}</div>}
      {events && events.length === 0 && (
        <div className="card muted">No events yet. You may not have access to any customer.</div>
      )}

      {events?.map((e) => {
        const orgSponsors = (sponsors ?? []).filter((s) => s.organization_id === e.organization_id);
        const strip = [...e.event_sponsors].sort((a, b) =>
          a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
        const inStrip = new Set(strip.map((x) => x.sponsor_id));
        return (
        <section key={e.id} className="card">
          <div className="event-row">
            <div>
              <div className="small muted">{e.organizations?.name}</div>
              <h2>{e.name}</h2>
              <div className="small muted">
                {[e.course_name, e.event_date].filter(Boolean).join(" · ")}
              </div>
            </div>
            <form action={setEventStatus} className="status-form">
              <input type="hidden" name="event_id" value={e.id} />
              <span className={`badge ${e.status}`}>{e.status}</span>
              {e.status !== "live" && <button className="btn small" name="status" value="live">Go live</button>}
              {e.status === "live" && <button className="btn small secondary" name="status" value="closed">Close event</button>}
            </form>
          </div>

          <div className="strip-admin">
            <h3>Sponsor strip <span className="small muted">— shown at the bottom of every contest page</span></h3>
            {strip.length === 0 && <p className="small muted">No sponsors in the strip yet.</p>}
            <ol className="strip-list">
              {strip.map((x, i) => {
                const sp = sponsorById.get(x.sponsor_id);
                const logo = logoUrl(sp?.logo_path);
                return (
                  <li key={x.id}>
                    <span className="strip-logo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logo ? <img src={logo} alt="" /> : null}
                    </span>
                    <span className="strip-name">{sp?.name ?? "?"}</span>
                    <form action={moveEventSponsor} className="row-actions">
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="id" value={x.id} />
                      <button className="btn small secondary" name="dir" value="up" disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn small secondary" name="dir" value="down" disabled={i === strip.length - 1} aria-label="Move down">↓</button>
                    </form>
                    <form action={removeEventSponsor}>
                      <input type="hidden" name="id" value={x.id} />
                      <button className="btn small danger" aria-label={`Remove ${sp?.name}`}>Remove</button>
                    </form>
                  </li>
                );
              })}
            </ol>
            {orgSponsors.some((s) => !inStrip.has(s.id)) && (
              <form action={addEventSponsor} className="strip-add">
                <input type="hidden" name="event_id" value={e.id} />
                <select name="sponsor_id" className="input" defaultValue="">
                  <option value="" disabled>Add a sponsor to the strip…</option>
                  {orgSponsors.filter((s) => !inStrip.has(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button className="btn small">Add</button>
              </form>
            )}
            <p className="small"><Link href="/admin/sponsors">Manage sponsors and logos →</Link></p>
          </div>

          <div className="contest-grid">
            {[...e.contests].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
              const url = `${base}/c/${c.public_token}`;
              const l = c.contest_leaders;
              return (
                <div key={c.id} className="contest-tile">
                  <div className="tile-head">
                    <strong>{c.name}</strong>
                    <span className={`badge ${c.status}`}>{c.status}</span>
                  </div>
                  <div className="small muted">{c.hole_number ? `Hole ${c.hole_number}` : ""}</div>
                  <form action={setContestSponsor}>
                    <input type="hidden" name="contest_id" value={c.id} />
                    <label className="small muted" htmlFor={`sp-${c.id}`}>Sponsor</label>
                    <AutoSubmitSelect id={`sp-${c.id}`} name="sponsor_id" className="input compact"
                      defaultValue={c.sponsor_id ?? ""} key={c.sponsor_id ?? "none"}>
                      <option value="">— None —</option>
                      {orgSponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </AutoSubmitSelect>
                  </form>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={url} target="_blank"><img src={qrs.get(c.id)} alt={`QR code for ${c.name}`} className="qr" /></a>
                  <a href={url} target="_blank" className="small break">{url}</a>
                  <div className="small">
                    Leader: {l?.leader_name
                      ? `${l.leader_name}${l.value !== null && c.scoring_mode !== "latest_claim" ? ` (${formatValue(l.value, c.unit)})` : ""}`
                      : "—"} · {l?.entry_count ?? 0} entries
                  </div>
                  <div className="tile-actions">
                    <Link href={`/admin/contests/${c.id}`} className="btn small secondary">Entries</Link>
                    <form action={setContestStatus}>
                      <input type="hidden" name="contest_id" value={c.id} />
                      {c.status === "open"
                        ? <button className="btn small secondary" name="status" value="closed">Close</button>
                        : <button className="btn small" name="status" value="open">Open</button>}
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        );
      })}
    </main>
  );
}
