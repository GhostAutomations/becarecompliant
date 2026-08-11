/**
 * Be Care Compliant — which evidence attachments the PDF can actually draw.
 *
 * Item 15. Uploaded files (a photographed passport on Right to Work, a DBS
 * certificate) live in the private evidence bucket, NOT in the answers, so the
 * inspector-facing PDF only ever printed the file name and the picture itself was
 * invisible on the document handed over. Signatures already draw because they ARE
 * in the answers.
 *
 * This module holds the two decisions that make drawing them safe, kept pure and
 * isomorphic so they can be unit tested without a Supabase client or a renderer:
 *
 *   1. WHAT CAN BE DRAWN. @react-pdf/renderer decodes PNG and JPEG and nothing
 *      else: no HEIC (which is what an iPhone uploads by default), no WEBP, no
 *      GIF, no SVG, no PDF. Anything it cannot decode must be named on the page
 *      and openly flagged as not shown, never silently dropped.
 *   2. HOW MUCH. A render runs in a serverless function, so a 40MB camera
 *      original must not be pulled into memory. Caps are per file, per evidence
 *      and per count; anything over is treated exactly like an undrawable type,
 *      so the paper still says the file exists.
 *
 * Deliberately permissive about a MISSING mime type and strict about a wrong one:
 * an upload path that stored application/octet-stream still gets drawn if the file
 * name ends .jpg, but "image/heic" is refused whatever it is called.
 */

/** The only formats @react-pdf/renderer can decode. */
export type DrawableFormat = "png" | "jpg";

/** One image is refused above this. A phone photo is ~2 to 5MB. */
export const MAX_DRAWN_IMAGE_BYTES = 8 * 1024 * 1024;

/** Total drawn bytes for one evidence record. */
export const MAX_DRAWN_TOTAL_BYTES = 24 * 1024 * 1024;

/** Hard count cap, so a pathological record cannot render 500 images. */
export const MAX_DRAWN_IMAGES = 12;

/** Why an attachment is not drawn. Not shown to users; useful in logs and tests. */
export type NotDrawnReason = "unsupported_format" | "too_large" | "budget_exceeded" | "too_many";

/** Decoded bytes ready for a PDF <Image>. */
export type DrawableImage = { data: Buffer; format: DrawableFormat };

/**
 * One attachment as the renderers see it. Lives HERE, not in images.ts, because
 * images.ts is "server-only" and lib/evidence/pdf.tsx must be able to name this type
 * without pulling a server-only module into a render tree.
 */
export type EvidenceAttachment = {
  fileName: string;
  /** "upload" or "signature", so the caption can read correctly. */
  kind: string;
  /** Null when the file is not drawable; the document then names it instead. */
  drawable: DrawableImage | null;
  /** Why it is not drawn (null when it is). "fetch_failed" only happens at runtime. */
  reason: NotDrawnReason | "fetch_failed" | null;
};

/** Attachments for one evidence record, keyed by form field key, in upload order. */
export type EvidenceAttachments = Record<string, EvidenceAttachment[]>;

/** One evidence_files row, as far as this decision is concerned. */
export type AttachmentRow = {
  fieldKey: string;
  kind: string;
  fileName: string | null;
  storagePath: string | null;
  mimeType: string | null;
  bytes: number | null;
};

export type AttachmentPlan = {
  fieldKey: string;
  kind: string;
  fileName: string;
  storagePath: string;
  /** Non-null only when this file should be fetched and drawn. */
  format: DrawableFormat | null;
  reason: NotDrawnReason | null;
};

/**
 * Decide the draw format from the mime type, falling back to the file extension
 * only when the mime type is absent or a generic binary. A recognised but
 * undrawable image type (heic, webp, gif, svg) returns null and is NOT rescued by
 * its extension.
 */
export function drawableFormat(
  mimeType: string | null | undefined,
  fileName?: string | null,
): DrawableFormat | null {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  // A known-but-undrawable type is refused here; only a missing or generic type
  // falls through to the extension.
  if (mime !== "" && mime !== "application/octet-stream" && mime !== "binary/octet-stream") {
    return null;
  }
  const name = (fileName ?? "").trim().toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  return null;
}

/**
 * Plan one evidence record's attachments in row order.
 *
 * EVERY row with a storage path comes back, because a file that cannot be drawn
 * must still be named on the document. `format` says whether to fetch and draw it;
 * `reason` says why not. Budgets accumulate over drawn files only, so a 30MB Word
 * document attached alongside a photo never stops the photo being drawn.
 */
export function planEvidenceAttachments(rows: AttachmentRow[]): AttachmentPlan[] {
  const plans: AttachmentPlan[] = [];
  let drawnCount = 0;
  let drawnBytes = 0;

  for (const row of rows) {
    if (!row.storagePath) continue; // nothing to fetch, and nothing to promise on paper
    const fileName = (row.fileName ?? "").trim() || "Attached file";
    const format = drawableFormat(row.mimeType, row.fileName);
    const base = { fieldKey: row.fieldKey, kind: row.kind, fileName, storagePath: row.storagePath };

    if (!format) {
      plans.push({ ...base, format: null, reason: "unsupported_format" });
      continue;
    }
    const size = row.bytes ?? 0;
    if (size > MAX_DRAWN_IMAGE_BYTES) {
      plans.push({ ...base, format: null, reason: "too_large" });
      continue;
    }
    if (drawnCount >= MAX_DRAWN_IMAGES) {
      plans.push({ ...base, format: null, reason: "too_many" });
      continue;
    }
    if (drawnBytes + size > MAX_DRAWN_TOTAL_BYTES) {
      plans.push({ ...base, format: null, reason: "budget_exceeded" });
      continue;
    }

    drawnCount += 1;
    drawnBytes += size;
    plans.push({ ...base, format, reason: null });
  }

  return plans;
}
