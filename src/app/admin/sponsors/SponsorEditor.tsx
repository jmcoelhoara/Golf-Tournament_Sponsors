"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_TYPES, logoUrl, normalizeWebsite } from "@/lib/logo";

export type Sponsor = {
  id: string;
  organization_id: string;
  name: string;
  logo_path: string | null;
  website_url: string | null;
};

function checkFile(file: File): string | null {
  if (!LOGO_TYPES[file.type]) return "Logo must be PNG, JPG, WebP or SVG.";
  if (file.size > LOGO_MAX_BYTES) return "Logo must be 2 MB or smaller.";
  return null;
}

async function uploadLogo(orgId: string, file: File): Promise<string> {
  const supabase = createClient();
  // A new file name every time, so phones never show a cached old logo.
  const path = `${orgId}/${crypto.randomUUID()}.${LOGO_TYPES[file.type]}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);
  return path;
}

async function removeLogoFile(path: string | null) {
  if (!path) return;
  await createClient().storage.from(LOGO_BUCKET).remove([path]);
}

export function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(sponsor.name);
  const [website, setWebsite] = useState(sponsor.website_url ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const url = logoUrl(sponsor.logo_path);
  const dirty = name.trim() !== sponsor.name || (website.trim() || "") !== (sponsor.website_url ?? "");

  async function replaceLogo(file: File) {
    const problem = checkFile(file);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setBusy("logo"); setMsg(null);
    try {
      const path = await uploadLogo(sponsor.organization_id, file);
      const { error } = await createClient().from("sponsors").update({ logo_path: path }).eq("id", sponsor.id);
      if (error) { await removeLogoFile(path); throw new Error(error.message); }
      await removeLogoFile(sponsor.logo_path);
      setMsg({ ok: true, text: "Logo updated. Golfers see it on their next refresh." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: `Upload failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    if (!sponsor.logo_path) return;
    setBusy("remove"); setMsg(null);
    const { error } = await createClient().from("sponsors").update({ logo_path: null }).eq("id", sponsor.id);
    if (!error) await removeLogoFile(sponsor.logo_path);
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Logo removed." });
    router.refresh();
  }

  async function saveDetails() {
    const site = normalizeWebsite(website);
    if (site === "invalid") { setMsg({ ok: false, text: "Website must be a valid https:// address." }); return; }
    if (!name.trim()) { setMsg({ ok: false, text: "Name can't be empty." }); return; }
    setBusy("save"); setMsg(null);
    const { error } = await createClient().from("sponsors")
      .update({ name: name.trim(), website_url: site }).eq("id", sponsor.id);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setWebsite(site ?? "");
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  async function deleteSponsor() {
    if (!window.confirm(`Delete ${sponsor.name}? It will be removed from every contest and event.`)) return;
    setBusy("delete");
    const { error } = await createClient().from("sponsors").delete().eq("id", sponsor.id);
    if (!error) await removeLogoFile(sponsor.logo_path);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    router.refresh();
  }

  return (
    <div className="sponsor-card">
      <div className="logo-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`${sponsor.name} logo`} /> : <span className="muted small">No logo</span>}
      </div>
      <div className="sponsor-fields">
        <label className="stack">
          <span className="small muted">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <label className="stack">
          <span className="small muted">Website (optional)</span>
          <input className="input" value={website} placeholder="https://"
            onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <div className="tile-actions wrap">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
            onChange={(e) => e.target.files?.[0] && replaceLogo(e.target.files[0])} />
          <button className="btn small" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === "logo" ? "Uploading…" : sponsor.logo_path ? "Replace logo" : "Upload logo"}
          </button>
          {sponsor.logo_path && (
            <button className="btn small secondary" disabled={!!busy} onClick={removeLogo}>Remove logo</button>
          )}
          {dirty && (
            <button className="btn small" disabled={!!busy} onClick={saveDetails}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
          )}
          <button className="btn small danger" disabled={!!busy} onClick={deleteSponsor}>Delete</button>
        </div>
        {msg && <div className={`result small ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

export function AddSponsorForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const site = normalizeWebsite(website);
    if (!name.trim()) { setError("Enter the sponsor's name."); return; }
    if (site === "invalid") { setError("Website must be a valid https:// address."); return; }
    if (file) { const p = checkFile(file); if (p) { setError(p); return; } }

    setBusy(true);
    const supabase = createClient();
    let path: string | null = null;
    try {
      if (file) path = await uploadLogo(orgId, file);
      const { error } = await supabase.from("sponsors")
        .insert({ organization_id: orgId, name: name.trim(), website_url: site, logo_path: path });
      if (error) { await removeLogoFile(path); throw new Error(error.message); }
      setName(""); setWebsite(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-sponsor" onSubmit={onSubmit}>
      <h3>Add a sponsor</h3>
      <div className="add-grid">
        <input className="input" placeholder="Sponsor name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        <input className="input" placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <input ref={fileRef} className="input file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn small" disabled={busy}>{busy ? "Adding…" : "Add sponsor"}</button>
      </div>
      <p className="small muted">Logo: PNG, JPG, WebP or SVG up to 2 MB. A wide logo on a transparent or white background looks best.</p>
      {error && <div className="result error small">{error}</div>}
    </form>
  );
}
