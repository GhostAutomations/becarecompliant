import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireCompany } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { buildSubjectAccessExport } from "@/lib/sar/build";
import { zipFileName } from "@/lib/sar/layout";
import { SAR_BUCKET } from "@/lib/sar/cleanup";

/**
 * Be Care Compliant — make a subject access export for one Person or Service User (2026-09-24).
 *
 * COMPANY ADMIN ONLY (Phil's choice): the company is the controller and answers the request.
 * Not in support mode either: the Founder is the processor and does not answer a tenant's SARs.
 *
 * The ZIP is too big to send back as a response (Vercel stops a function's response at 4.5 MB),
 * so it goes into the private subject-access bucket and a five minute download link comes back.
 * The nightly retention run removes it a day later. Every run is written to the audit log, so it
 * shows in the record's History.
 */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { user, profile } = await requireCompany();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  if (profile.actingAsCompanyId) return json({ error: "Support mode is for looking. A subject access request is answered by the company." }, 403);
  if (profile.role !== "company_admin" || !profile.company_id) {
    return json({ error: "Only a Company Admin can make a subject access export." }, 403);
  }

  let body: { kind?: string; recordId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "That request could not be read." }, 400);
  }
  const kind = body.kind === "person" || body.kind === "service_user" ? body.kind : null;
  const recordId = String(body.recordId ?? "");
  if (!kind || !/^[0-9a-f-]{36}$/i.test(recordId)) return json({ error: "That record could not be found." }, 400);

  const built = await buildSubjectAccessExport({
    kind,
    recordId,
    companyId: profile.company_id,
    actorName: profile.full_name || profile.email,
  });
  if (!built.ok) return json({ error: built.error }, 404);
  const r = built.result;

  const exportId = randomUUID();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const name = zipFileName(r.recordName, today);
  const path = `${profile.company_id}/${exportId}/${name}`;
  const service = createServiceClient();
  const { error: upErr } = await service.storage.from(SAR_BUCKET).upload(path, r.zip, { contentType: "application/zip", upsert: false });
  if (upErr) return json({ error: `The export could not be saved: ${upErr.message}` }, 500);

  await service.from("sar_exports").insert({
    id: exportId,
    company_id: profile.company_id,
    person_id: kind === "person" ? recordId : null,
    service_user_id: kind === "service_user" ? recordId : null,
    record_name: r.recordName,
    storage_path: path,
    bytes: r.zip.byteLength,
    file_count: r.fileCount,
    created_by: user.id,
    created_by_name: profile.full_name,
  });

  const { data: signed, error: signErr } = await service.storage.from(SAR_BUCKET).createSignedUrl(path, 300, { download: name });
  if (signErr || !signed?.signedUrl) return json({ error: `The export was made but the link could not be: ${signErr?.message ?? "no link"}` }, 500);

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "record.subject_access_exported",
    entityType: kind,
    entityId: recordId,
    summary: `Made a subject access export for ${r.recordName} (${r.fileCount} files${r.missing.length ? `, ${r.missing.length} could not be read` : ""})`,
    metadata: { export_id: exportId, bytes: r.zip.byteLength, files: r.fileCount, missing: r.missing.length },
  });

  return json({ url: signed.signedUrl, name, files: r.fileCount, missing: r.missing });
}
