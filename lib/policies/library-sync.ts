import "server-only";

/**
 * Be Care Compliant: keeping the policy guidance library current (Phil, 2026-10-06: "can we set it
 * to update every 28 days?" and "I approve each change").
 *
 *   syncLibrary   upserts the founder curated list (library-seed.ts) so the code is the one home
 *                 for which sources and topics exist.
 *   checkSources  fetches every source due a check (never checked, or 28 days since). A source
 *                 seen for the FIRST time becomes current at once: it is on the founder's own
 *                 list. A source whose text has CHANGED does not: the new text waits as pending,
 *                 with a plain English summary, and the founder is told in the Founder inbox and
 *                 by email. Nothing a company's AI reads changes until he approves it.
 *   approveChange makes the pending text current. "Tell companies" also marks every company
 *                 policy written on that topic: "the guidance behind this policy changed, review it".
 *
 * Service client throughout: this runs from the founder's screen and from the cron, and the
 * library tables are founder only for writes.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { fetchSourceText, MIN_LEGISLATION_CHARS } from "./sources";
import { SEED_SOURCES, SEED_TOPICS } from "./library-seed";
import { runAi } from "@/lib/ai/anthropic";
import { notifyFounder } from "@/lib/founder/notify";
import { siteUrl } from "@/lib/site";

export const RECHECK_DAYS = 28;

export async function syncLibrary(): Promise<{ error: string | null }> {
  const db = createServiceClient();
  /* A source whose LINK changed is a different page, not a change to the same one: it starts
     again and loads fresh, rather than waiting for approval as a "change". */
  const { data: had } = await db.from("policy_sources").select("key, url");
  const oldUrl = new Map(((had as Array<{ key: string; url: string }> | null) ?? []).map((r) => [r.key, r.url]));
  const moved = SEED_SOURCES.filter((s) => oldUrl.has(s.key) && oldUrl.get(s.key) !== s.url).map((s) => s.key);
  if (moved.length > 0) {
    await db
      .from("policy_sources")
      .update({ current_text: null, current_hash: null, checked_at: null, approved_at: null, pending_text: null, pending_hash: null, pending_summary: null, pending_found_at: null, last_error: null })
      .in("key", moved);
  }
  const { error: sErr } = await db.from("policy_sources").upsert(
    SEED_SOURCES.map((s) => ({ key: s.key, publisher: s.publisher, title: s.title, url: s.url, regions: s.regions })),
    { onConflict: "key" },
  );
  if (sErr) return { error: sErr.message };
  /* A source taken off the list stops being read, but is kept: drafts already written cite it. */
  const keep = SEED_SOURCES.map((s) => s.key);
  await db.from("policy_sources").update({ active: false }).not("key", "in", `(${keep.join(",")})`);
  const { error: tErr } = await db.from("policy_topics").upsert(
    SEED_TOPICS.map((t, i) => ({
      key: t.key,
      title: t.title,
      summary: t.summary,
      required_by: t.requiredBy,
      questions: t.questions,
      source_keys: t.sourceKeys,
      sort: i,
    })),
    { onConflict: "key" },
  );
  return { error: tErr?.message ?? null };
}

type SourceRow = {
  id: string;
  key: string;
  title: string;
  url: string;
  current_text: string | null;
  current_hash: string | null;
  pending_hash: string | null;
  checked_at: string | null;
};

async function summariseChange(title: string, before: string, after: string): Promise<string> {
  const r = await runAi({
    companyId: null,
    feature: "policy_source_change",
    maxTokens: 2000,
    system:
      "You compare two versions of an official UK web page used as guidance for care policies. If the only differences are page furniture, navigation, banners, dates of the page itself, spacing or formatting, reply with exactly: No change in substance. Otherwise say in plain UK English, in at most four short sentences, what changed in substance for a care provider's policies. Never repeat unchanged content. No dashes as punctuation.",
    prompt: `Source: ${title}\n\nBEFORE:\n${before.slice(0, 15_000)}\n\nAFTER:\n${after.slice(0, 15_000)}`,
  });
  return "ok" in r
    ? r.ok.replace(/\n*\(This reply was cut short[^)]*\)\s*$/, "").trim()
    : `Could not summarise the change: ${r.error}`;
}

export type CheckResult = { checked: number; unchanged: number; added: number; changed: string[]; failed: string[] };

export async function checkSources(opts: { force?: boolean; keys?: string[] } = {}): Promise<CheckResult> {
  const db = createServiceClient();
  const out: CheckResult = { checked: 0, unchanged: 0, added: 0, changed: [], failed: [] };
  let q = db.from("policy_sources").select("id, key, title, url, current_text, current_hash, pending_hash, checked_at").eq("active", true);
  if (opts.keys?.length) q = q.in("key", opts.keys);
  const { data } = await q;
  const due = ((data as SourceRow[] | null) ?? []).filter((s) => {
    if (opts.force || !s.checked_at) return true;
    return Date.now() - new Date(s.checked_at).getTime() >= RECHECK_DAYS * 86_400_000;
  });

  for (const s of due) {
    out.checked += 1;
    const now = new Date().toISOString();
    const got = await fetchSourceText(s.url);
    if (!got.ok) {
      out.failed.push(`${s.title}: ${got.error}`);
      /* A change found earlier is dropped: it can no longer be confirmed, so it must not be approvable. */
      await db
        .from("policy_sources")
        .update({ last_error: got.error, pending_text: null, pending_hash: null, pending_summary: null, pending_found_at: null })
        .eq("id", s.id);
      continue;
    }
    if (!s.current_text) {
      out.added += 1;
      await db
        .from("policy_sources")
        .update({ current_text: got.text, current_hash: got.hash, checked_at: now, approved_at: now, last_error: null })
        .eq("id", s.id);
      continue;
    }
    if (got.hash === s.current_hash || got.hash === s.pending_hash) {
      out.unchanged += 1;
      await db.from("policy_sources").update({ checked_at: now, last_error: null }).eq("id", s.id);
      continue;
    }
    const summary = await summariseChange(s.title, s.current_text, got.text);
    out.changed.push(s.title);
    await db
      .from("policy_sources")
      .update({ pending_text: got.text, pending_hash: got.hash, pending_summary: summary, pending_found_at: now, checked_at: now, last_error: null })
      .eq("id", s.id);
  }

  if (out.changed.length > 0) {
    const list = out.changed.map((t) => `- ${t}`).join("\n");
    await notifyFounder({
      subject: `Policy guidance changed: ${out.changed.length} source${out.changed.length === 1 ? "" : "s"} to review`,
      heading: "Policy guidance has changed",
      preheader: "Approve the changes before companies see them.",
      bodyHtml: `<p>The 28 day check found changes in these sources:</p><ul>${out.changed
        .map((t) => `<li>${t.replace(/</g, "&lt;")}</li>`)
        .join("")}</ul><p>Nothing reaches a company until you approve it.</p>`,
      bodyText: `The 28 day check found changes in these sources:\n${list}\n\nNothing reaches a company until you approve it.`,
      ctaLabel: "Review the changes",
      ctaUrl: `${siteUrl()}/founder/policy-library`,
    });
  }
  return out;
}

export async function approveSourceChange(
  sourceId: string,
  tellCompanies: boolean,
): Promise<{ ok: string } | { error: string }> {
  const db = createServiceClient();
  const { data: s } = await db
    .from("policy_sources")
    .select("id, key, title, pending_text, pending_hash, pending_summary, last_error")
    .eq("id", sourceId)
    .maybeSingle<{ id: string; key: string; title: string; pending_text: string | null; pending_hash: string | null; pending_summary: string | null; last_error: string | null }>();
  if (!s) return { error: "That source could not be found." };
  if (!s.pending_text) return { error: "There is no change waiting on that source." };
  if (s.last_error) return { error: `${s.title} could not be read on its last check, so this change cannot be approved. Press Check now.` };
  if (s.pending_text.trim().length < MIN_LEGISLATION_CHARS) return { error: `${s.title} has almost no readable text, so there is nothing to approve.` };
  const now = new Date().toISOString();
  const { error } = await db
    .from("policy_sources")
    .update({
      current_text: s.pending_text,
      current_hash: s.pending_hash,
      approved_at: now,
      pending_text: null,
      pending_hash: null,
      pending_summary: null,
      pending_found_at: null,
    })
    .eq("id", s.id);
  if (error) return { error: error.message };
  if (!tellCompanies) return { ok: "Approved. Companies were not told, as this was not a change in substance." };

  const { data: topics } = await db.from("policy_topics").select("key").contains("source_keys", [s.key]);
  const keys = ((topics as Array<{ key: string }> | null) ?? []).map((t) => t.key);
  if (keys.length === 0) return { ok: "Approved. No standard policy uses this source." };
  const note = `Guidance changed: ${s.title}. ${(s.pending_summary ?? "").replace(/\s+/g, " ").slice(0, 600)}`;
  const { data: flagged, error: fErr } = await db
    .from("company_policies")
    .update({ guidance_changed_at: now, guidance_change_note: note })
    .in("topic_key", keys)
    .eq("status", "active")
    .select("id");
  if (fErr) return { error: fErr.message };
  const n = flagged?.length ?? 0;
  return { ok: `Approved. ${n} company ${n === 1 ? "policy is" : "policies are"} now marked for review.` };
}

/** Every change waiting (and readable), in one go. Each one goes through the same checks as a single approval. */
export async function approveAllSourceChanges(tellCompanies: boolean): Promise<{ approved: number; flagged: string[]; refused: string[] }> {
  const db = createServiceClient();
  const { data } = await db
    .from("policy_sources")
    .select("id")
    .eq("active", true)
    .not("pending_text", "is", null)
    .is("last_error", null);
  const out = { approved: 0, flagged: [] as string[], refused: [] as string[] };
  for (const r of (data as Array<{ id: string }> | null) ?? []) {
    const res = await approveSourceChange(r.id, tellCompanies);
    if ("error" in res) out.refused.push(res.error);
    else {
      out.approved += 1;
      if (tellCompanies) out.flagged.push(res.ok);
    }
  }
  return out;
}
