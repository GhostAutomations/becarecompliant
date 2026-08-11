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

/** Decoded bytes ready for a PDF <Image>, with the picture's real pixel size when it
 *  could be read from the file header (see imagePixelSize). */
export type DrawableImage = {
  data: Buffer;
  format: DrawableFormat;
  pixelWidth?: number;
  pixelHeight?: number;
};

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

/**
 * Read a PNG or JPEG's pixel dimensions straight from its header.
 *
 * WHY THIS EXISTS. The first version drew every photograph into a fixed square box
 * with objectFit contain. That is safe (nothing can ever be taller than the page)
 * but it reserves the full square whatever the picture's shape, so a landscape photo
 * left ~70pt of empty space under it. On a Supervision record that was enough to push
 * the document one line past A4 and produce a COMPLETELY BLANK SECOND PAGE on a
 * regulator-facing document. Knowing the real shape means the box is only as tall as
 * the picture actually needs.
 *
 * Header-only, no decoding: PNG dimensions live in the IHDR chunk at a fixed offset,
 * JPEG's in the first SOF frame marker. Anything unreadable returns null and the
 * renderer falls back to the safe square box, so a malformed file degrades rather
 * than throwing inside a render.
 */
export function imagePixelSize(bytes: Buffer): { width: number; height: number } | null {
  try {
    // PNG: 8 byte signature, then IHDR (length, "IHDR", width, height).
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    // JPEG: walk the marker segments to the first Start Of Frame.
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i += 1; // resynchronise rather than give up on a padded stream
          continue;
        }
        const marker = bytes[i + 1];
        // Standalone markers carry no length.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        if (marker === 0xd9) return null; // end of image, no frame found
        const length = bytes.readUInt16BE(i + 2);
        if (length < 2) return null;
        // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPG (c8) and DAC (cc).
        const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isFrame) {
          const height = bytes.readUInt16BE(i + 5);
          const width = bytes.readUInt16BE(i + 7);
          return width > 0 && height > 0 ? { width, height } : null;
        }
        i += 2 + length;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** The widest a drawn attachment is allowed to be, in PDF points. Sized to sit inside
 *  the value column of the two column evidence layout. */
export const DRAWN_IMAGE_WIDTH = 200;

/** And the tallest, so a portrait document can never be taller than the page.
 *  Set at 280 deliberately: a phone's ordinary 3:4 portrait photo is exactly 267pt tall
 *  at the full 200pt width, so the commonest shape of all fits without being narrowed,
 *  and only genuinely extreme pictures (a 9:16 screenshot, a scanned strip) are capped. */
export const DRAWN_IMAGE_MAX_HEIGHT = 280;

/**
 * The box to draw a picture in: as wide as allowed, as tall as the picture's own shape
 * needs, and never taller than the cap. Without known dimensions it falls back to a
 * square, which is the safe shape objectFit contain was designed for.
 */
export function drawnImageBox(pixelWidth?: number, pixelHeight?: number): { width: number; height: number } {
  if (!pixelWidth || !pixelHeight || pixelWidth <= 0 || pixelHeight <= 0) {
    return { width: DRAWN_IMAGE_WIDTH, height: DRAWN_IMAGE_WIDTH };
  }
  const height = Math.round(DRAWN_IMAGE_WIDTH * (pixelHeight / pixelWidth));
  if (height <= DRAWN_IMAGE_MAX_HEIGHT) return { width: DRAWN_IMAGE_WIDTH, height: Math.max(height, 1) };
  // Very tall picture: cap the height and narrow the width to keep the shape.
  const width = Math.max(1, Math.round(DRAWN_IMAGE_MAX_HEIGHT * (pixelWidth / pixelHeight)));
  return { width, height: DRAWN_IMAGE_MAX_HEIGHT };
}
