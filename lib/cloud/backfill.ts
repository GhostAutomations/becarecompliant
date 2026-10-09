import "server-only";

/**
 * Be Care Compliant — "Copy everything so far" (0437, Phil 2026-10-08: from now on, plus a copy
 * all button). Puts every document the company already holds into the copy queue, plus a folder
 * for every current person and service user. The worker then works through it in the background
 * (the cron runs every minute and copies about sixty a run), and Settings shows how many are still waiting.
 *
 * Safe to press twice: every job has the same unique key as the live copy of the same document,
 * so nothing is queued twice, and an upload replaces a file of the same name.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { CloudSourceKind } from "@/lib/cloud/sources";

type Job = { company_id: string; source_kind: CloudSourceKind; source_id: string; dedupe_key: string; created_at: string };

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function queueEverything(companyId: string): Promise<number> {
  const db = createServiceClient();
  const jobs: Job[] = [];
  // One time for the whole lot, although it is written in chunks of 500, so the progress bar sees
  // a single run (Phil 2026-10-09: it jumped from 621 to 122 when the first chunk finished).
  const createdAt = new Date().toISOString();
  const add = (kind: CloudSourceKind, id: string) =>
    jobs.push({ company_id: companyId, source_kind: kind, source_id: id, dedupe_key: `${kind}:${id}`, created_at: createdAt });

  // Folders for everyone current (leavers and discharged keep any folder they already have).
  const people = await all<{ id: string }>((a, b) =>
    db.from("people").select("id").eq("company_id", companyId).is("archived_at", null).range(a, b),
  );
  people.forEach((p) => add("record_folder", `person:${p.id}`));
  const sus = await all<{ id: string; care_plan_path: string | null }>((a, b) =>
    db.from("service_users").select("id, care_plan_path").eq("company_id", companyId).is("archived_at", null).range(a, b),
  );
  sus.forEach((s) => {
    add("record_folder", `service_user:${s.id}`);
    if (s.care_plan_path) add("care_plan", s.id);
  });

  // Every piece of evidence still holding its detail, and the files uploaded inside it.
  const evidence = await all<{ id: string }>((a, b) =>
    db
      .from("evidence")
      .select("id")
      .eq("company_id", companyId)
      .is("anonymised_at", null)
      .in("record_type", ["person", "service_user", "complaint", "incident"])
      .order("submitted_at", { ascending: true })
      .range(a, b),
  );
  evidence.forEach((e) => add("evidence", e.id));
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const files = await all<{ evidence_id: string; storage_path: string }>((a, b) =>
    db.from("evidence_files").select("evidence_id, storage_path").eq("company_id", companyId).eq("kind", "upload").range(a, b),
  );
  files.filter((f) => evidenceIds.has(f.evidence_id)).forEach((f) => add("evidence_file", `${f.evidence_id}|${f.storage_path}`));

  const training = await all<{ id: string }>((a, b) =>
    db.from("person_training").select("id").eq("company_id", companyId).not("certificate_path", "is", null).range(a, b),
  );
  training.forEach((t) => add("training_cert", t.id));

  const invites = await all<{ id: string }>((a, b) =>
    db.from("absence_meeting_letters").select("id").eq("company_id", companyId).not("pdf_path", "is", null).range(a, b),
  );
  invites.forEach((l) => add("meeting_letter", l.id));
  const outcomes = await all<{ id: string }>((a, b) =>
    db.from("absence_outcome_letters").select("id").eq("company_id", companyId).not("pdf_path", "is", null).range(a, b),
  );
  outcomes.forEach((l) => add("outcome_letter", l.id));

  // Every version of every policy, so the history is there too.
  const policies = await all<{ id: string }>((a, b) => db.from("company_policies").select("id").eq("company_id", companyId).range(a, b));
  if (policies.length) {
    const ids = policies.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("company_policy_versions").select("policy_id, version").in("policy_id", ids.slice(i, i + 200));
      ((data ?? []) as Array<{ policy_id: string; version: number }>).forEach((v) => add("policy_version", `${v.policy_id}:${v.version}`));
    }
  }

  // Documents added to a person's or service user's record (0439), unless a Company Admin removed them.
  const documents = await all<{ id: string }>((a, b) =>
    db.from("record_documents").select("id").eq("company_id", companyId).is("removed_at", null).range(a, b),
  );
  documents.forEach((d) => add("record_document", d.id));

  const notices = await all<{ id: string; kind: string; files: unknown }>((a, b) =>
    db.from("briefing_notices").select("id, kind, files").eq("company_id", companyId).range(a, b),
  );
  notices.forEach((n) => {
    if (n.kind === "memo") add("notice", n.id);
    const count = Array.isArray(n.files) ? n.files.length : 0;
    for (let i = 1; i <= count; i++) add("notice_file", `${n.id}|${i}`);
  });

  for (let i = 0; i < jobs.length; i += 500) {
    const { error } = await db
      .from("cloud_sync_queue")
      .upsert(jobs.slice(i, i + 500), { onConflict: "company_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return jobs.length;
}
