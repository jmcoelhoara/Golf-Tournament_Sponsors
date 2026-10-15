import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { formatValue, type Unit } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { setContestStatus, setEventStatus, signOut } from "./actions";

type ContestRow = {
  id: string; name: string; status: "draft" | "open" | "closed"; public_token: string;
  hole_number: number | null; unit: Unit; scoring_mode: string;
  sponsors: { name: string } | null;
  contest_leaders: { leader_name: string | null; team_name: string | null; value: number | null; entry_count: number } | null;
};
type EventRow = {
  id: string; name: string; course_name: string | null; event_date: string | null;
  status: "draft" | "live" | "closed" | "archived";
  organizations: { name: string } | null;
  contests: ContestRow[];
};

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
    .select(`id, name, course_name, event_date, status,
      organizations ( name ),
      contests ( id, name, status, public_token, hole_number, unit, scoring_mode,
        sponsors ( name ),
        contest_leaders ( leader_name, team_name, value, entry_count ) )`)
    .order("event_date", { ascending: false })
    .returns<EventRow[]>();

  const base = await siteUrl();
  const qrs = new Map<string, string>();
  for (const e of events ?? []) {
    for (const c of e.contests) {
      qrs.set(c.id, await QRCode.toDataURL(`${base}/c/${c.public_token}`, { margin: 1, width: 240 }));
    }
  }

  return (
    <main className="shell wide">
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <div className="small muted">{auth.user.email}</div>
        </div>
        <form action={signOut}><button className="link">Sign out</button></form>
      </div>

      {error && <div className="result error">Couldn&apos;t load events: {error.message}</div>}
      {events && events.length === 0 && (
        <div className="card muted">No events yet. You may not have access to any customer.</div>
      )}

      {events?.map((e) => (
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
                  <div className="small muted">
                    {c.hole_number ? `Hole ${c.hole_number}` : ""}{c.sponsors ? ` · ${c.sponsors.name}` : ""}
                  </div>
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
      ))}
    </main>
  );
}
