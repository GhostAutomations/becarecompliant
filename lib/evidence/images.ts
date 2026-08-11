import "server-only";

/**
 * Be Care Compliant — fetch an evidence record's attachments for rendering (item 15).
 *
 * Uploaded files live in the PRIVATE evidence bucket, so nothing about them reaches
 * a renderer unless it is fetched on purpose. This is that fetch, and it is the only
 * place evidence binaries are pulled into a PDF render.
 *
 * AUTHORISATION, in two halves, deliberately:
 *   - the evidence_files ROWS are read through the CALLER's RLS client, exactly as
 *     getEvidenceView does, so a caller who may not see the parent evidence gets an
 *     empty map and no file names leak;
 *   - only the BYTES are pulled with the service role, because the bucket is private
 *     and there is no other way to read it. The service role is never used to decide
 *     who may see what.
 *
 * NEVER THROWS. A missing object, a storage outage or a corrupt row degrades to
 * "named but not drawn", which the PDF prints honestly. An immutable compliance
 * record must still render when its bucket has a bad day.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "./storage";
import {
  imagePixelSize,
  planEvidenceAttachments,
  type AttachmentRow,
  type EvidenceAttachment,
  type EvidenceAttachments,
} from "./image-format";

export type { EvidenceAttachment, EvidenceAttachments } from "./image-format";

type FileRow = {
  field_key: string;
  kind: string;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  bytes: number | null;
};

export async function loadEvidenceAttachments(evidenceId: string): Promise<EvidenceAttachments> {
  const out: EvidenceAttachments = {};
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("evidence_files")
      .select("field_key, kind, file_name, storage_path, mime_type, bytes")
      .eq("evidence_id", evidenceId)
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return out;

    const rows: AttachmentRow[] = (data as FileRow[]).map((f) => ({
      fieldKey: f.field_key,
      kind: f.kind,
      fileName: f.file_name,
      storagePath: f.storage_path,
      mimeType: f.mime_type,
      bytes: f.bytes,
    }));

    const plans = planEvidenceAttachments(rows);
    if (plans.length === 0) return out;

    const admin = createServiceClient();

    // Fetched in parallel: a record with several photos should not render at the
    // sum of its download times.
    const fetched = await Promise.all(
      plans.map(async (plan): Promise<EvidenceAttachment> => {
        const named: EvidenceAttachment = {
          fileName: plan.fileName,
          kind: plan.kind,
          drawable: null,
          reason: plan.reason,
        };
        if (!plan.format) return named;
        try {
          const { data: blob, error: dlErr } = await admin.storage
            .from(EVIDENCE_BUCKET)
            .download(plan.storagePath);
          if (dlErr || !blob) return { ...named, reason: "fetch_failed" };
          const buffer = Buffer.from(await blob.arrayBuffer());
          if (buffer.length === 0) return { ...named, reason: "fetch_failed" };
          // Real pixel size, so the PDF reserves the picture's own shape rather than a
          // square. Unknown is fine: the renderer falls back to a square box.
          const size = imagePixelSize(buffer);
          return {
            ...named,
            drawable: {
              data: buffer,
              format: plan.format,
              pixelWidth: size?.width,
              pixelHeight: size?.height,
            },
            reason: null,
          };
        } catch {
          return { ...named, reason: "fetch_failed" };
        }
      }),
    );

    for (let i = 0; i < plans.length; i += 1) {
      const key = plans[i].fieldKey;
      (out[key] ??= []).push(fetched[i]);
    }
    return out;
  } catch {
    // A render that loses its attachments is far better than a record that will not
    // open at all: the PDF falls back to exactly what it printed before item 15.
    return out;
  }
}
