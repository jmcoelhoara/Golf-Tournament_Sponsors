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
