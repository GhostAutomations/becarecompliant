"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { approveAllSourceChanges, approveSourceChange, checkSources, syncLibrary } from "./library-sync";

/** Founder: load the curated list and fetch every source now, whatever its date. */
export async function syncAndCheckAll(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const { profile } = await requirePlatformAdmin();
  const synced = await syncLibrary();
  if (synced.error) return { error: synced.error };
  const r = await checkSources({ force: true });
  await writeAudit({
    companyId: null,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "policy_library.checked",
    entityType: "policy_library",
    entityId: null,
    summary: `Policy library checked: ${r.checked} sources, ${r.added} new, ${r.changed.length} changed, ${r.failed.length} failed`,
    metadata: r,
  });
  revalidatePath("/founder/policy-library");
  return {
    ok: `Checked ${r.checked}: ${r.added} loaded, ${r.unchanged} unchanged, ${r.changed.length} changed, ${r.failed.length} could not be read.${r.deferred ? ` ${r.deferred} left for time: press again to check them.` : ""}`,
  };
}

export async function checkOneSource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const key = String(fd.get("key") ?? "");
  if (!key) return { error: "Missing source." };
  const r = await checkSources({ force: true, keys: [key] });
  revalidatePath("/founder/policy-library");
  if (r.failed.length) return { error: r.failed[0] };
  return { ok: r.changed.length ? "Changed: waiting for your approval." : r.added ? "Loaded." : "No change." };
}

export async function approveChange(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requirePlatformAdmin();
  const id = String(fd.get("source_id") ?? "");
  const tell = fd.get("tell") === "1";
  const r = await approveSourceChange(id, tell, String(fd.get("pending_hash") ?? "") || null);
  if ("error" in r) return { error: r.error };
  await writeAudit({
    companyId: null,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: tell ? "policy_library.change_approved" : "policy_library.change_approved_quietly",
    entityType: "policy_source",
    entityId: id,
    summary: r.ok,
  });
  revalidatePath("/founder/policy-library");
  return { ok: r.ok };
}

export async function approveAllChanges(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requirePlatformAdmin();
  const tell = fd.get("tell") === "1";
  const r = await approveAllSourceChanges(tell);
  await writeAudit({
    companyId: null,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: tell ? "policy_library.all_changes_approved" : "policy_library.all_changes_approved_quietly",
    entityType: "policy_library",
    entityId: null,
    summary: `Approved ${r.approved} source changes${tell ? " and told companies" : " quietly"}; ${r.refused.length} refused`,
    metadata: r,
  });
  revalidatePath("/founder/policy-library");
  if (r.approved === 0 && r.refused.length === 0) return { error: "There are no changes waiting." };
  const base = `Approved ${r.approved} ${r.approved === 1 ? "change" : "changes"}${tell ? " and told companies" : " quietly"}.`;
  return r.refused.length ? { error: `${base} ${r.refused.length} could not be approved: ${r.refused.join(" ")}` } : { ok: base };
}
