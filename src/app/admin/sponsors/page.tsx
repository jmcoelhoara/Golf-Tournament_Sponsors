import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "../AdminNav";
import { AddSponsorForm, SponsorCard, type Sponsor } from "./SponsorEditor";

export default function SponsorsPage() {
  return (
    <Suspense fallback={<main className="shell"><div className="card muted">Loading…</div></main>}>
      <SponsorsContent />
    </Suspense>
  );
}

async function SponsorsContent() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, sponsors ( id, organization_id, name, logo_path, website_url )")
    .order("name")
    .returns<{ id: string; name: string; sponsors: Sponsor[] }[]>();

  return (
    <main className="shell wide">
      <AdminNav email={auth.user.email ?? ""} current="sponsors" />
      <p className="muted small">
        Logos show on the golfer contest pages. Changes appear for golfers the next time their page loads.
        Pick which sponsors appear on each contest, and in the event&apos;s sponsor strip, on the Events page.
      </p>
      {orgs?.map((o) => (
        <section key={o.id} className="card">
          {orgs.length > 1 && <div className="eyebrow">{o.name}</div>}
          <h2>Sponsors ({o.sponsors.length})</h2>
          <div className="sponsor-list">
            {[...o.sponsors].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <SponsorCard key={`${s.id}:${s.logo_path}:${s.name}:${s.website_url}`} sponsor={s} />
            ))}
          </div>
          <AddSponsorForm orgId={o.id} />
        </section>
      ))}
    </main>
  );
}
