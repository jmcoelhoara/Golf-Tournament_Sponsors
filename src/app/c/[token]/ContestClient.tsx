"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ERROR_MESSAGES, formatValue, type Unit } from "@/lib/format";

type Leader = {
  name: string | null;
  team: string | null;
  value: number | null;
  unit: Unit;
  entry_count: number;
  updated_at: string;
} | null;

type Contest = {
  available: true;
  contest_id: string;
  name: string;
  kind: "long_drive" | "closest_to_pin" | "other";
  division: string | null;
  hole_number: number | null;
  tees: string | null;
  hole_yardage: number | null;
  scoring_mode: "lowest_value" | "highest_value" | "latest_claim";
  unit: Unit;
  min_value: number | null;
  max_value: number | null;
  requires_approval: boolean;
  accepting_entries: boolean;
  event: { name: string; course_name: string | null; event_date: string | null };
  sponsor: { name: string; logo_path: string | null; website_url: string | null } | null;
  leader: Leader;
};

type Unavailable = { available: false; reason: string; event_name?: string };

type Golfer = { golfer_id: string; display_name: string; team_name: string | null; starting_hole: number | null };

type Result =
  | { kind: "ok"; status: "accepted" | "pending"; youLead: boolean }
  | { kind: "error"; message: string };

const supabase = createClient();

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: keep going without remembering */ }
}

export default function ContestClient({ token }: { token: string }) {
  const [contest, setContest] = useState<Contest | Unavailable | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [leader, setLeader] = useState<Leader>(null);
  const [roster, setRoster] = useState<Golfer[] | null>(null);
  const [golferId, setGolferId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [alreadyEntered, setAlreadyEntered] = useState(false);

  const golferKey = `golfer:${token}`;
  const enteredKey = (g: string) => `entered:${token}:${g}`;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_contest_public", { p_token: token });
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    setContest(data as Contest | Unavailable);
    if ((data as Contest).available) setLeader((data as Contest).leader ?? null);
  }, [token]);

  // Initial load + remembered golfer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
      const saved = storageGet(golferKey);
      if (saved) {
        setGolferId(saved);
        setAlreadyEntered(storageGet(enteredKey(saved)) === "1");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const contestId = contest && contest.available ? contest.contest_id : null;
  const accepting = contest && contest.available ? contest.accepting_entries : false;

  // Roster once we know the contest is open
  useEffect(() => {
    if (!accepting) return;
    supabase.rpc("get_contest_roster", { p_token: token }).then(({ data }) => {
      if (data) setRoster(data as Golfer[]);
    });
  }, [accepting, token]);

  // Live leader updates, with a slow poll as a fallback for weak signal
  useEffect(() => {
    if (!contestId) return;
    const channel = supabase
      .channel(`leader-${contestId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contest_leaders", filter: `contest_id=eq.${contestId}` },
        (payload) => {
          const row = payload.new as {
            leader_name: string | null; team_name: string | null; value: number | null;
            unit: Unit; entry_count: number; updated_at: string;
          };
          if (row && "unit" in row) {
            setLeader({
              name: row.leader_name, team: row.team_name, value: row.value,
              unit: row.unit, entry_count: row.entry_count, updated_at: row.updated_at,
            });
          }
        },
      )
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [contestId, load]);

  const me = useMemo(
    () => roster?.find((g) => g.golfer_id === golferId) ?? null,
    [roster, golferId],
  );

  const filtered = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return roster.filter((g) =>
      g.display_name.toLowerCase().includes(q) || (g.team_name ?? "").toLowerCase().includes(q),
    ).slice(0, 30);
  }, [roster, search]);

  function chooseGolfer(id: string) {
    setGolferId(id);
    storageSet(golferKey, id);
    setAlreadyEntered(storageGet(enteredKey(id)) === "1");
    setResult(null);
    setSearch("");
  }

  function clearGolfer() {
    setGolferId(null);
    storageSet(golferKey, null);
    setAlreadyEntered(false);
    setResult(null);
  }

  function currentValue(c: Contest): number | null | "invalid" {
    if (c.scoring_mode === "latest_claim") return null;
    if (c.unit === "inches") {
      const f = feet.trim() === "" ? 0 : Number(feet);
      const i = inches.trim() === "" ? 0 : Number(inches);
      if (feet.trim() === "" && inches.trim() === "") return "invalid";
      if (!Number.isFinite(f) || !Number.isFinite(i) || f < 0 || i < 0 || i >= 12) return "invalid";
      return Math.round((f * 12 + i) * 100) / 100;
    }
    const v = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(v) || v < 0) return "invalid";
    return v;
  }

  async function submit(c: Contest) {
    if (!golferId) return;
    const value = currentValue(c);
    if (value === "invalid") {
      setResult({ kind: "error", message: c.unit === "inches"
        ? "Enter feet and inches (inches must be 0–11)." : "Enter a valid number." });
      return;
    }

    // The same request id is reused for retries so a flaky connection can't double-submit.
    const pendingKey = `pending:${token}:${golferId}`;
    let requestId = storageGet(pendingKey);
    if (!requestId) { requestId = crypto.randomUUID(); storageSet(pendingKey, requestId); }

    setSubmitting(true);
    setResult(null);
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.rpc("submit_contest_entry", {
        p_token: token, p_golfer_id: golferId, p_value: value, p_client_request_id: requestId,
      });
      if (!error && data) {
        const d = data as { ok: boolean; error?: string; status?: "accepted" | "pending"; entry_id?: string;
          leader?: Leader };
        storageSet(pendingKey, null);
        if (d.ok) {
          storageSet(enteredKey(golferId), "1");
          setAlreadyEntered(true);
          if (d.leader !== undefined) setLeader(d.leader);
          const youLead = Boolean(d.leader && me && d.leader.name === me.display_name);
          setResult({ kind: "ok", status: d.status ?? "accepted", youLead });
        } else {
          if (d.error === "already_submitted") {
            storageSet(enteredKey(golferId), "1");
            setAlreadyEntered(true);
          }
          setResult({ kind: "error", message: ERROR_MESSAGES[d.error ?? ""] ?? "Something went wrong." });
        }
        setSubmitting(false);
        return;
      }
      lastError = error?.message ?? "";
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    setSubmitting(false);
    setResult({ kind: "error",
      message: "No connection. Your entry is saved on this phone — tap submit again when you have signal." });
    console.warn(lastError);
  }

  // ----- render -----
  if (loadError && !contest) {
    return <Shell><div className="card"><p>Can&apos;t connect right now. Check your signal and refresh.</p>
      <button className="btn" onClick={load}>Try again</button></div></Shell>;
  }
  if (!contest) return <Shell><div className="card muted">Loading…</div></Shell>;
  if (!contest.available) {
    return (
      <Shell>
        <div className="card">
          <h1>{contest.reason === "not_found" ? "Contest not found" : "Not open yet"}</h1>
          <p className="muted">
            {contest.reason === "not_found"
              ? "This QR code isn't valid. Ask a tournament volunteer for help."
              : `${contest.event_name ?? "This event"} hasn't started yet. Check back soon.`}
          </p>
        </div>
      </Shell>
    );
  }

  const c = contest;
  const logoUrl = c.sponsor?.logo_path
    ? supabase.storage.from("sponsor-logos").getPublicUrl(c.sponsor.logo_path).data.publicUrl
    : null;
  const isClaim = c.scoring_mode === "latest_claim";

  return (
    <Shell>
      <header className="event-head">
        <div className="eyebrow">{c.event.name}</div>
        {c.event.course_name && <div className="muted small">{c.event.course_name}</div>}
      </header>

      <section className="card contest-card">
        {c.sponsor && (
          <div className="sponsor">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={c.sponsor.name} className="sponsor-logo" />
            ) : null}
            <div className="small muted">Sponsored by</div>
            <div className="sponsor-name">{c.sponsor.name}</div>
          </div>
        )}
        <h1>{c.name}</h1>
        <div className="chips">
          {c.hole_number && <span className="chip">Hole {c.hole_number}</span>}
          {c.tees && <span className="chip">{c.tees} tees</span>}
          {c.hole_yardage && <span className="chip">{c.hole_yardage} yds</span>}
        </div>
      </section>

      <section className="card leader-card" aria-live="polite">
        <div className="eyebrow">Current leader</div>
        {leader && leader.name ? (
          <>
            <div className="leader-name">{leader.name}</div>
            <div className="muted">
              {leader.team}
              {leader.value !== null && !isClaim ? ` · ${formatValue(leader.value, leader.unit)}` : ""}
            </div>
            <div className="small muted">{leader.entry_count} {leader.entry_count === 1 ? "entry" : "entries"}</div>
          </>
        ) : (
          <div className="muted">No entries yet — be the first!</div>
        )}
      </section>

      {!c.accepting_entries ? (
        <section className="card"><p>This contest is closed. Thanks for playing!</p></section>
      ) : (
        <section className="card">
          {!golferId || (roster && !me) ? (
            <>
              <h2>Who are you?</h2>
              <input
                className="input" type="search" placeholder="Type your name or team"
                value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
              />
              {roster === null && <p className="muted small">Loading players…</p>}
              {search.trim().length >= 2 && filtered.length === 0 && roster && (
                <p className="muted small">No match. Check the spelling or ask a volunteer.</p>
              )}
              <ul className="roster">
                {filtered.map((g) => (
                  <li key={g.golfer_id}>
                    <button className="roster-item" onClick={() => chooseGolfer(g.golfer_id)}>
                      <span>{g.display_name}</span>
                      <span className="muted small">{g.team_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="me">
                <div>
                  <div className="small muted">Playing as</div>
                  <div className="me-name">{me?.display_name ?? "…"}</div>
                  {me?.team_name && <div className="small muted">{me.team_name}</div>}
                </div>
                <button className="link" onClick={clearGolfer}>Not you?</button>
              </div>

              {result?.kind === "ok" ? (
                <div className="result ok">
                  {result.status === "pending"
                    ? "Entry received — a volunteer will confirm it shortly."
                    : result.youLead ? "🏆 You're the new leader!" : "Entry recorded. Good luck!"}
                </div>
              ) : alreadyEntered ? (
                <div className="result">You&apos;ve already entered this contest.</div>
              ) : (
                <>
                  {isClaim ? (
                    <p className="muted">
                      Did your drive land past the current leader&apos;s marker (and in the fairway)? Claim the lead.
                      The volunteer at the hole may check.
                    </p>
                  ) : c.unit === "inches" ? (
                    <>
                      <h2>Your distance to the pin</h2>
                      <div className="row">
                        <label className="field">
                          <input className="input" inputMode="numeric" value={feet}
                            onChange={(e) => setFeet(e.target.value)} placeholder="0" />
                          <span>feet</span>
                        </label>
                        <label className="field">
                          <input className="input" inputMode="decimal" value={inches}
                            onChange={(e) => setInches(e.target.value)} placeholder="0" />
                          <span>inches</span>
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2>Your result</h2>
                      <label className="field">
                        <input className="input" inputMode="decimal" value={amount}
                          onChange={(e) => setAmount(e.target.value)} />
                        <span>{c.unit}</span>
                      </label>
                    </>
                  )}
                  <button className="btn" disabled={submitting} onClick={() => submit(c)}>
                    {submitting ? "Sending…" : isClaim ? "I'm the new leader" : "Submit"}
                  </button>
                  <p className="small muted">One entry per golfer.</p>
                </>
              )}
              {result?.kind === "error" && <div className="result error">{result.message}</div>}
            </>
          )}
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="shell">{children}</main>;
}
