"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setContestStatus(formData: FormData) {
  const id = String(formData.get("contest_id"));
  const status = String(formData.get("status"));
  if (!["draft", "open", "closed"].includes(status)) return;
  const supabase = await createClient();
  await supabase.from("contests").update({ status }).eq("id", id);
  revalidatePath("/admin");
  revalidatePath(`/admin/contests/${id}`);
}

export async function setEventStatus(formData: FormData) {
  const id = String(formData.get("event_id"));
  const status = String(formData.get("status"));
  if (!["draft", "live", "closed", "archived"].includes(status)) return;
  const supabase = await createClient();
  await supabase.from("events").update({ status }).eq("id", id);
  revalidatePath("/admin");
}

export async function reviewEntry(formData: FormData) {
  const entryId = String(formData.get("entry_id"));
  const contestId = String(formData.get("contest_id"));
  const status = String(formData.get("status"));
  if (!["accepted", "rejected", "void"].includes(status)) return;
  const supabase = await createClient();
  await supabase.rpc("review_contest_entry", {
    p_entry_id: entryId,
    p_status: status,
    p_note: null,
  });
  revalidatePath(`/admin/contests/${contestId}`);
}

export async function setContestSponsor(formData: FormData) {
  const contestId = String(formData.get("contest_id"));
  const sponsorId = String(formData.get("sponsor_id") ?? "");
  const supabase = await createClient();
  await supabase.from("contests").update({ sponsor_id: sponsorId || null }).eq("id", contestId);
  revalidatePath("/admin");
}

export async function addEventSponsor(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const sponsorId = String(formData.get("sponsor_id") ?? "");
  if (!sponsorId) return;
  const supabase = await createClient();
  const { data: last } = await supabase.from("event_sponsors").select("sort_order")
    .eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("event_sponsors")
    .insert({ event_id: eventId, sponsor_id: sponsorId, sort_order: (last?.sort_order ?? -1) + 1 });
  revalidatePath("/admin");
}

export async function removeEventSponsor(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("event_sponsors").delete().eq("id", id);
  revalidatePath("/admin");
}

export async function moveEventSponsor(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")) === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: rows } = await supabase.from("event_sponsors").select("id")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (!rows) return;
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await Promise.all(rows.map((r, idx) =>
    supabase.from("event_sponsors").update({ sort_order: idx }).eq("id", r.id)));
  revalidatePath("/admin");
}
