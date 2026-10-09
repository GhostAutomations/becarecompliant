import "server-only";

/**
 * Be Care Compliant — what each queued copy actually IS (0437): the bytes, the file name and the
 * folder it belongs in. One resolver per kind of document. Read with the service role; every
 * read is pinned to the job's own company, so a job can never pull another company's document.
 *
 * A resolver returns null when there is nothing (any longer) to copy, e.g. the evidence was
 * anonymised by the retention rule before the copy ran; the job is then closed, not retried.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { renderEvidenceBytes } from "@/lib/evidence/on-demand";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { datedFileName, fileExtensionOf, initialsOf, recordFileName, safeDriveName, type FolderKey } from "@/lib/cloud/names";

export type CloudSourceKind =
  | "evidence"
  | "evidence_file"
  | "training_cert"
  | "meeting_letter"
  | "outcome_letter"
  | "care_plan"
  | "record_folder"
  | "policy_version"
  | "notice"
  | "notice_file";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

function londonDay(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
}

/** A stored file from the private bucket, only if it sits under this company's folder. */
async function download(companyId: string, path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path || !path.startsWith(`${companyId}/`)) return null;
  const db = createServiceClient();
  const { data, error } = await db.storage.from(EVIDENCE_BUCKET).download(path);
  if (error || !data) {
    if (error && /not found|does not exist/i.test(error.message)) return null;
    throw new Error(`The stored file could not be read${error ? `: ${error.message}` : ""}.`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

function recordKey(type: string, id: string): FolderKey | null {
  if (type === "person") return `person:${id}`;
  if (type === "service_user") return `service_user:${id}`;
  if (type === "complaint") return "section:complaints";
  if (type === "incident") return "section:incidents";
  return null;
}

export type ResolvedCopy = {
  folderKey: FolderKey;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  /** Only make the folder (a new person or service user), nothing to upload. */
  folderOnly?: boolean;
};

/**
 * Who a person's or service user's file belongs to, for its name (Phil, 2026-10-09): their
 * initials, and a service user's SSID. Null for anything that is not a record folder.
 */
async function recordParts(companyId: string, key: FolderKey): Promise<{ initials: string; ssid: string | null } | null> {
  if (!key.startsWith("person:") && !key.startsWith("service_user:")) return null;
  const isPerson = key.startsWith("person:");
  const id = key.slice(key.indexOf(":") + 1);
  const db = createServiceClient();
  const { data } = await db
    .from(isPerson ? "people" : "service_users")
    .select(isPerson ? "full_name" : "full_name, ssid")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ full_name: string; ssid?: string | null }>();
  if (!data) return null;
  return { initials: initialsOf(data.full_name), ssid: isPerson ? null : (data.ssid ?? null) };
}

/**
 * Which one of the same thing on the same London day this is: 1 for the first, 2 for the second.
 * Worked out from the rows themselves (oldest first, then id), so the same document always gets
 * the same name however many times it is copied, and a second one never overwrites the first.
 */
function ordinalOn<T extends { id: string; at: string }>(rows: T[], day: string, id: string): number {
  const same = rows
    .filter((r) => londonDay(r.at) === day)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
  const i = same.findIndex((r) => r.id === id);
  return i < 0 ? 1 : i + 1;
}

function dayWindow(day: string): { from: string; to: string } {
  const d = new Date(`${day}T00:00:00Z`);
  return { from: new Date(d.getTime() - 86_400_000).toISOString(), to: new Date(d.getTime() + 2 * 86_400_000).toISOString() };
}

async function evidenceOrdinal(
  companyId: string,
  ev: { id: string; record_type: string; record_id: string; submitted_at: string; forms: { name: string } | null },
): Promise<number> {
  const day = londonDay(ev.submitted_at);
  if (!day) return 1;
  const w = dayWindow(day);
  const db = createServiceClient();
  const { data } = await db
    .from("evidence")
    .select("id, submitted_at, forms(name)")
    .eq("company_id", companyId)
    .eq("record_type", ev.record_type)
    .eq("record_id", ev.record_id)
    .gte("submitted_at", w.from)
    .lt("submitted_at", w.to);
  // Counted by the form's NAME, because the file is named by it: two different forms that share a
  // name (a library copy and the company's own) must still not land on the same file.
  const name = (ev.forms?.name ?? "Form").trim().toLowerCase();
  const rows = ((data ?? []) as Array<{ id: string; submitted_at: string; forms: { name: string } | { name: string }[] | null }>)
    .filter((r) => {
      const f = Array.isArray(r.forms) ? r.forms[0] : r.forms;
      return (f?.name ?? "Form").trim().toLowerCase() === name;
    })
    .map((r) => ({ id: r.id, at: r.submitted_at }));
  return ordinalOn(rows, day, ev.id);
}

async function evidenceCopy(companyId: string, evidenceId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("evidence")
    .select("id, company_id, record_type, record_id, form_id, submitted_at, anonymised_at, forms(name), form_versions(version)")
    .eq("id", evidenceId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      record_type: string;
      record_id: string;
      form_id: string | null;
      submitted_at: string;
      anonymised_at: string | null;
      forms: { name: string } | null;
      form_versions: { version: number } | null;
    }>();
  if (!data || data.anonymised_at) return null;
  const folderKey = recordKey(data.record_type, data.record_id);
  if (!folderKey) return null;
  const rendered = await renderEvidenceBytes(evidenceId, { trusted: true });
  if (!rendered.ok) throw new Error(rendered.error);
  const london = londonDay(data.submitted_at);
  const who = await recordParts(companyId, folderKey);
  const fileName = who
    ? recordFileName({ ...who, title: data.forms?.name ?? "Form", dateIso: london, n: await evidenceOrdinal(companyId, data) })
    : // Complaints and incidents sit in their section folders: the reference keeps them apart.
      datedFileName(london, `${data.forms?.name ?? "Form"} ${rendered.ref}`, { version: data.form_versions?.version ?? null });
  return {
    folderKey,
    fileName,
    bytes: new Uint8Array(rendered.bytes),
    contentType: "application/pdf",
  };
}

/** A file uploaded inside a form (a DBS scan, a paper copy, a certificate photo). Signatures are
 *  part of the PDF and are never copied on their own. sourceId: "<evidenceId>|<storage path>". */
async function evidenceFileCopy(companyId: string, sourceId: string): Promise<ResolvedCopy | null> {
  const [evidenceId, path] = sourceId.split("|");
  if (!evidenceId || !path) return null;
  const db = createServiceClient();
  const [{ data: ev }, { data: file }] = await Promise.all([
    db
      .from("evidence")
      .select("id, record_type, record_id, form_id, submitted_at, anonymised_at, forms(name)")
      .eq("id", evidenceId)
      .eq("company_id", companyId)
      .maybeSingle<{ id: string; record_type: string; record_id: string; form_id: string | null; submitted_at: string; anonymised_at: string | null; forms: { name: string } | null }>(),
    db
      .from("evidence_files")
      .select("id, file_name, kind, mime_type")
      .eq("evidence_id", evidenceId)
      .eq("storage_path", path)
      .maybeSingle<{ id: string; file_name: string; kind: string; mime_type: string | null }>(),
  ]);
  if (!ev || ev.anonymised_at || !file || file.kind === "signature") return null;
  const folderKey = recordKey(ev.record_type, ev.record_id);
  if (!folderKey) return null;
  const bytes = await download(companyId, path);
  if (!bytes) return null;
  const ext = fileExtensionOf(file.file_name);
  const stem = file.file_name.replace(/\.[a-z0-9]{1,8}$/i, "");
  const who = await recordParts(companyId, folderKey);
  let fileName: string;
  if (who) {
    // Two files of the same name in one form get "2", "3"; a second form that day gets " (2)".
    const { data: siblings } = await db
      .from("evidence_files")
      .select("id, file_name, created_at")
      .eq("evidence_id", evidenceId)
      .eq("kind", "upload");
    const same = ((siblings ?? []) as Array<{ id: string; file_name: string; created_at: string }>)
      .filter((f) => f.file_name === file.file_name)
      .sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
    const k = Math.max(1, same.findIndex((f) => f.id === file.id) + 1);
    fileName = recordFileName({
      ...who,
      title: `${ev.forms?.name ?? "Form"} ${stem}${k > 1 ? ` ${k}` : ""}`,
      dateIso: londonDay(ev.submitted_at),
      n: await evidenceOrdinal(companyId, ev),
      ext: ext || "pdf",
    });
  } else {
    // A complaint or incident: the case's evidence reference and the file's place keep two photos
    // called "image.jpg" from landing on one another.
    const { data: siblings } = await db
      .from("evidence_files")
      .select("id, file_name, created_at")
      .eq("evidence_id", evidenceId)
      .eq("kind", "upload");
    const same = ((siblings ?? []) as Array<{ id: string; file_name: string; created_at: string }>)
      .filter((f) => f.file_name === file.file_name)
      .sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
    const k = Math.max(1, same.findIndex((f) => f.id === file.id) + 1);
    const ref = evidenceId.slice(0, 8).toUpperCase();
    fileName = datedFileName(londonDay(ev.submitted_at), `${ev.forms?.name ?? "Form"} ${ref} ${stem}${k > 1 ? ` ${k}` : ""}`, { ext: ext || "pdf" });
  }
  return {
    folderKey,
    fileName,
    bytes,
    contentType: file.mime_type || MIME[ext] || "application/octet-stream",
  };
}

async function trainingCertCopy(companyId: string, trainingId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("person_training")
    .select("person_id, certificate_path, completed_on, training_courses:course_id(name)")
    .eq("id", trainingId)
    .eq("company_id", companyId)
    .maybeSingle<{ person_id: string; certificate_path: string | null; completed_on: string | null; training_courses: { name: string } | { name: string }[] | null }>();
  if (!data?.certificate_path) return null;
  const bytes = await download(companyId, data.certificate_path);
  if (!bytes) return null;
  const course = (Array.isArray(data.training_courses) ? data.training_courses[0] : data.training_courses)?.name ?? "Training";
  const ext = fileExtensionOf(data.certificate_path) || "pdf";
  const folderKey: FolderKey = `person:${data.person_id}`;
  const who = await recordParts(companyId, folderKey);
  return {
    folderKey,
    // A new certificate for the same course and date replaces the old one, which is what it is.
    fileName: who
      ? recordFileName({ ...who, title: `${course} certificate`, dateIso: data.completed_on ?? "", ext })
      : datedFileName(data.completed_on ?? "", `${course} certificate`, { ext }),
    bytes,
    contentType: MIME[ext] ?? "application/octet-stream",
  };
}

async function meetingLetterCopy(companyId: string, letterId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("absence_meeting_letters")
    .select("person_id, kind, stage, sent_at, pdf_path")
    .eq("id", letterId)
    .eq("company_id", companyId)
    .maybeSingle<{ person_id: string; kind: string; stage: number | null; sent_at: string; pdf_path: string | null }>();
  if (!data?.pdf_path) return null;
  const bytes = await download(companyId, data.pdf_path);
  if (!bytes) return null;
  const what = `${data.stage ? `Stage ${data.stage} ` : ""}absence meeting ${data.kind === "rearranged" ? "rearranged letter" : "invitation"}`;
  const folderKey: FolderKey = `person:${data.person_id}`;
  const who = await recordParts(companyId, folderKey);
  const day = londonDay(data.sent_at);
  let n = 1;
  if (who && day) {
    const w = dayWindow(day);
    const { data: rows } = await db
      .from("absence_meeting_letters")
      .select("id, sent_at")
      .eq("company_id", companyId)
      .eq("person_id", data.person_id)
      .not("pdf_path", "is", null)
      .gte("sent_at", w.from)
      .lt("sent_at", w.to);
    n = ordinalOn(((rows ?? []) as Array<{ id: string; sent_at: string }>).map((r) => ({ id: r.id, at: r.sent_at })), day, letterId);
  }
  return {
    folderKey,
    fileName: who ? recordFileName({ ...who, title: what, dateIso: day, n }) : datedFileName(day, what),
    bytes,
    contentType: "application/pdf",
  };
}

async function outcomeLetterCopy(companyId: string, letterId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("absence_outcome_letters")
    .select("person_id, approved_at, pdf_path")
    .eq("id", letterId)
    .eq("company_id", companyId)
    .maybeSingle<{ person_id: string; approved_at: string | null; pdf_path: string | null }>();
  if (!data?.pdf_path) return null;
  const bytes = await download(companyId, data.pdf_path);
  if (!bytes) return null;
  const folderKey: FolderKey = `person:${data.person_id}`;
  const who = await recordParts(companyId, folderKey);
  const day = londonDay(data.approved_at);
  let n = 1;
  if (who && day) {
    const w = dayWindow(day);
    const { data: rows } = await db
      .from("absence_outcome_letters")
      .select("id, approved_at")
      .eq("company_id", companyId)
      .eq("person_id", data.person_id)
      .not("pdf_path", "is", null)
      .gte("approved_at", w.from)
      .lt("approved_at", w.to);
    n = ordinalOn(((rows ?? []) as Array<{ id: string; approved_at: string }>).map((r) => ({ id: r.id, at: r.approved_at })), day, letterId);
  }
  return {
    folderKey,
    fileName: who
      ? recordFileName({ ...who, title: "Absence meeting outcome letter", dateIso: day, n })
      : datedFileName(day, "Absence meeting outcome letter"),
    bytes,
    contentType: "application/pdf",
  };
}

async function carePlanCopy(companyId: string, serviceUserId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("service_users")
    .select("care_plan_path, care_plan_uploaded_at")
    .eq("id", serviceUserId)
    .eq("company_id", companyId)
    .maybeSingle<{ care_plan_path: string | null; care_plan_uploaded_at: string | null }>();
  if (!data?.care_plan_path) return null;
  const bytes = await download(companyId, data.care_plan_path);
  if (!bytes) return null;
  const ext = fileExtensionOf(data.care_plan_path) || "pdf";
  const folderKey: FolderKey = `service_user:${serviceUserId}`;
  const who = await recordParts(companyId, folderKey);
  return {
    folderKey,
    // A care plan replaced on the same day replaces its copy: the latest plan is the plan.
    fileName: who
      ? recordFileName({ ...who, title: "Care plan", dateIso: londonDay(data.care_plan_uploaded_at), ext })
      : datedFileName(londonDay(data.care_plan_uploaded_at), "Care plan", { ext }),
    bytes,
    contentType: MIME[ext] ?? "application/octet-stream",
  };
}

/** One version of a policy, into Policies. sourceId: "<policyId>:<version>". */
async function policyVersionCopy(companyId: string, sourceId: string): Promise<ResolvedCopy | null> {
  const [policyId, v] = sourceId.split(":");
  const version = Number(v);
  if (!policyId || !Number.isInteger(version)) return null;
  const db = createServiceClient();
  const [{ data: policy }, { data: ver }] = await Promise.all([
    db
      .from("company_policies")
      .select("title, source, reference")
      .eq("id", policyId)
      .eq("company_id", companyId)
      .maybeSingle<{ title: string; source: string | null; reference: string | null }>(),
    db
      .from("company_policy_versions")
      .select("storage_path, file_name, body")
      .eq("policy_id", policyId)
      .eq("version", version)
      .maybeSingle<{ storage_path: string | null; file_name: string | null; body: string | null }>(),
  ]);
  if (!policy || !ver) return null;
  let bytes: Uint8Array | null = null;
  let ext = "pdf";
  if (ver.body && ver.body.trim()) {
    // A written policy is drawn from its frozen wording, exactly as it is opened in the app.
    const { renderWrittenPolicy } = await import("@/lib/policies/render");
    const r = await renderWrittenPolicy(policyId, version);
    if (!r.ok) throw new Error(r.error);
    bytes = new Uint8Array(r.pdf);
  } else {
    bytes = await download(companyId, ver.storage_path);
    ext = fileExtensionOf(ver.file_name ?? ver.storage_path ?? "") || "pdf";
  }
  if (!bytes) return null;
  /* Named by the policy's reference when it has one ("POL-HR-001 Lone Working v2.pdf"), which
     never changes. Without one, two policies sharing a title each carry a short id of their own,
     so neither can ever land on the other's copies, whichever is renamed later. */
  const ref = String(policy.reference ?? "").trim();
  let stem = ref ? `${ref} ${policy.title}` : policy.title;
  if (!ref) {
    const { count } = await db
      .from("company_policies")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .ilike("title", likeExact(policy.title));
    if ((count ?? 0) > 1) stem = `${policy.title} ${policyId.slice(0, 6)}`;
  }
  return {
    folderKey: "section:policies",
    fileName: datedFileName("", `${stem} v${version}`, { ext }),
    bytes,
    contentType: MIME[ext] ?? "application/octet-stream",
  };
}

/** A memo sent as a Briefing, as its letterhead PDF, into Briefings. Messages have no PDF. */
async function noticeCopy(companyId: string, noticeId: string): Promise<ResolvedCopy | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("briefing_notices")
    .select("id, company_id, kind, title, body, files, response, created_by, created_at, from_name, from_role")
    .eq("id", noticeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data || data.kind !== "memo") return null;
  const { renderNoticeMemo } = await import("@/lib/briefings/memo");
  const pdf = await renderNoticeMemo(data as Parameters<typeof renderNoticeMemo>[0], "");
  const day = londonDay(data.created_at as string);
  const n = await noticeOrdinal(companyId, noticeId, data.title as string, day);
  return {
    folderKey: "section:briefings",
    fileName: datedFileName(day, `${data.title as string} (memo)`, { n }),
    bytes: new Uint8Array(pdf),
    contentType: "application/pdf",
  };
}

/** A file sent with a memo, message or attachment. sourceId: "<noticeId>|<n>" (1 based). */
async function noticeFileCopy(companyId: string, sourceId: string): Promise<ResolvedCopy | null> {
  const [noticeId, n] = sourceId.split("|");
  const index = Number(n);
  const db = createServiceClient();
  const { data } = await db
    .from("briefing_notices")
    .select("title, files, created_at")
    .eq("id", noticeId)
    .eq("company_id", companyId)
    .maybeSingle<{ title: string; files: unknown; created_at: string }>();
  const files = Array.isArray(data?.files) ? (data!.files as Array<{ path?: string; name?: string; type?: string }>) : [];
  const f = files[index - 1];
  if (!data || !f?.path) return null;
  const bytes = await download(companyId, f.path);
  if (!bytes) return null;
  const name = String(f.name ?? "File");
  const ext = fileExtensionOf(name) || "pdf";
  // Two files of the same name in one briefing get "2", "3"; a second briefing with the same
  // title that day gets " (2)".
  const k = files.slice(0, index).filter((x) => String(x.name ?? "File") === name).length;
  const day = londonDay(data.created_at);
  const nth = await noticeOrdinal(companyId, noticeId, data.title, day);
  return {
    folderKey: "section:briefings",
    fileName: datedFileName(day, `${data.title} ${name.replace(/\.[a-z0-9]{1,8}$/i, "")}${k > 1 ? ` ${k}` : ""}`, { ext, n: nth }),
    bytes,
    contentType: f.type || MIME[ext] || "application/octet-stream",
  };
}

/** Which briefing of the same title this is on its day (1 for the first), for its file names. */
async function noticeOrdinal(companyId: string, noticeId: string, title: string, day: string): Promise<number> {
  if (!day) return 1;
  const w = dayWindow(day);
  const db = createServiceClient();
  const { data } = await db
    .from("briefing_notices")
    .select("id, title, created_at")
    .eq("company_id", companyId)
    .gte("created_at", w.from)
    .lt("created_at", w.to);
  const t = String(title ?? "").trim().toLowerCase();
  const rows = ((data ?? []) as Array<{ id: string; title: string; created_at: string }>)
    .filter((r) => String(r.title ?? "").trim().toLowerCase() === t)
    .map((r) => ({ id: r.id, at: r.created_at }));
  return ordinalOn(rows, day, noticeId);
}

/** A case insensitive "equals" for ilike: the wildcards in a name are matched as themselves. */
function likeExact(value: string): string {
  return String(value ?? "").replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function resolveCloudCopy(
  companyId: string,
  kind: string,
  sourceId: string,
): Promise<ResolvedCopy | null> {
  switch (kind as CloudSourceKind) {
    case "evidence":
      return evidenceCopy(companyId, sourceId);
    case "evidence_file":
      return evidenceFileCopy(companyId, sourceId);
    case "training_cert":
      return trainingCertCopy(companyId, sourceId);
    case "meeting_letter":
      return meetingLetterCopy(companyId, sourceId);
    case "outcome_letter":
      return outcomeLetterCopy(companyId, sourceId);
    case "care_plan":
      return carePlanCopy(companyId, sourceId);
    case "policy_version":
      return policyVersionCopy(companyId, sourceId);
    case "notice":
      return noticeCopy(companyId, sourceId);
    case "notice_file":
      return noticeFileCopy(companyId, sourceId);
    case "record_folder": {
      // "person:<id>" or "service_user:<id>": a new record gets its folder straight away (Phil,
      // 2026-10-08: "when a new client or service user is added, they would get a file created").
      const facts = await recordFolderFacts(companyId, sourceId as FolderKey);
      if (!facts) return null;
      return { folderKey: sourceId as FolderKey, fileName: "", bytes: new Uint8Array(), contentType: "", folderOnly: true };
    }
    default:
      throw new Error(`Unknown kind of document: ${kind}`);
  }
}

/**
 * The name a record's folder should have right now: "Name (Branch)", and the record's place among
 * records with the same name in the same branch (oldest first), so two John Smiths in Cardiff
 * get "John Smith (Cardiff)" and "John Smith 2 (Cardiff)" and never share a folder.
 */
export async function recordFolderFacts(
  companyId: string,
  key: FolderKey,
): Promise<{ fullName: string; branchName: string | null; n: number } | null> {
  const db = createServiceClient();
  if (key.startsWith("person:") || key.startsWith("service_user:")) {
    const isPerson = key.startsWith("person:");
    const table = isPerson ? "people" : "service_users";
    const id = key.slice(key.indexOf(":") + 1);
    const { data } = await db
      .from(table)
      .select("full_name, branch_id, branches:branch_id(name)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle<{ full_name: string; branch_id: string | null; branches: { name: string } | { name: string }[] | null }>();
    if (!data) return null;
    const b = Array.isArray(data.branches) ? (data.branches[0] ?? null) : data.branches;
    // Same folder name, not just the same typed name: "Jane  Smith" and '"Jane" Smith' become the
    // same folder, so they are numbered together. Narrowed to names containing the first word as
    // the drive will see it (every name that cleans to the same folder name contains it), then
    // compared exactly as the drive will see them.
    const folderKeyName = (n: string) => safeDriveName(n, "Unnamed").toLowerCase();
    const mine = folderKeyName(data.full_name);
    const first = mine.split(" ")[0] ?? "";
    let q = db.from(table).select("id, full_name, created_at").eq("company_id", companyId).ilike("full_name", `%${likeExact(first)}%`);
    q = data.branch_id ? q.eq("branch_id", data.branch_id) : q.is("branch_id", null);
    const { data: candidates } = await q;
    const ranked = ((candidates ?? []) as Array<{ id: string; full_name: string; created_at: string }>)
      .filter((r) => folderKeyName(r.full_name) === mine)
      .sort((x, y) => (x.created_at === y.created_at ? x.id.localeCompare(y.id) : x.created_at.localeCompare(y.created_at)));
    const n = Math.max(1, ranked.findIndex((r) => r.id === id) + 1);
    return { fullName: data.full_name, branchName: b?.name ?? null, n };
  }
  return null;
}
