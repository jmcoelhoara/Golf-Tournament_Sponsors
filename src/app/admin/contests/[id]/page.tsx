import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatValue, type Unit } from "@/lib/format";
import { reviewEntry } from "../../actions";

type Entry = {
  id: string; golfer_id: string; value: number | null;
  status: "pending" | "accepted" | "rejected" | "void";
  submitted_at: string; review_note: string | null;
};

export default function ContestEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="shell"><div className="card muted">Loading…</div></main>}>
      <EntriesContent params={params} />
    </Suspense>
  );
}

async function EntriesContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: contest } = await supabase
    .from("contests")
    .select("id, name, unit, scoring_mode, requires_approval, status, event_id")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; unit: Unit; scoring_mode: string;
      requires_approval: boolean; status: string; event_id: string }>();
  if (!contest) notFound();

  const { data: entries } = await supabase
    .from("contest_entries")
    .select("id, golfer_id, value, status, submitted_at, review_note")
    .eq("contest_id", id)
    .order("submitted_at", { ascending: false })
    .returns<Entry[]>();

  const golferIds = [...new Set((entries ?? []).map((e) => e.golfer_id))];
  const { data: golfers } = golferIds.length
    ? await supabase.from("golfers").select("id, first_name, last_name, teams ( name )").in("id", golferIds)
      .returns<{ id: string; first_name: string; last_name: string; teams: { name: string } | null }[]>()
    : { data: [] };
  const byId = new Map((golfers ?? []).map((g) => [g.id, g]));

  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver",
  });
  const isClaim = contest.scoring_mode === "latest_claim";

  return (
    <main className="shell wide">
      <div className="topbar">
        <Link href="/admin" className="link">← All events</Link>
      </div>
      <section className="card">
        <h1>{contest.name}</h1>
        <p className="small muted">
          {entries?.length ?? 0} entries · {contest.requires_approval ? "attendant approves entries" : "entries count right away"}
        </p>
        {(!entries || entries.length === 0) && <p className="muted">No entries yet.</p>}
        <table className="table">
          <thead>
            <tr><th>Time</th><th>Golfer</th>{!isClaim && <th>Result</th>}<th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {entries?.map((e) => {
              const g = byId.get(e.golfer_id);
              return (
                <tr key={e.id} className={e.status === "void" || e.status === "rejected" ? "dim" : ""}>
                  <td>{time.format(new Date(e.submitted_at))}</td>
                  <td>{g ? `${g.first_name} ${g.last_name}` : "?"}<div className="small muted">{g?.teams?.name}</div></td>
                  {!isClaim && <td>{formatValue(e.value, contest.unit)}</td>}
                  <td><span className={`badge ${e.status}`}>{e.status}</span></td>
                  <td>
                    <form action={reviewEntry} className="row-actions">
                      <input type="hidden" name="entry_id" value={e.id} />
                      <input type="hidden" name="contest_id" value={contest.id} />
                      {e.status === "pending" && <>
                        <button className="btn small" name="status" value="accepted">Accept</button>
                        <button className="btn small secondary" name="status" value="rejected">Reject</button>
                      </>}
                      {(e.status === "pending" || e.status === "accepted") &&
                        <button className="btn small danger" name="status" value="void">Void</button>}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
