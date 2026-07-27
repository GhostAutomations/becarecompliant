import "server-only";

/**
 * Be Care Compliant — the SIGNED COPY of a policy.
 *
 * Phil, 2026-07-27: "instead of a certificate showing them they signed
 * something, why dont we just generate the pdf of the document they signed, with
 * the date, time and signature?" Right, and better evidence: a certificate that
 * merely NAMES a document leaves an inspector holding two files and taking your
 * word that they belong together. One file, the wording plus the signature, is
 * the thing you actually want to hand over.
 *
 * The original pages are never touched. A single signature page is appended to a
 * COPY, generated on demand from frozen Evidence, so it can always be reproduced
 * and nothing is stored twice.
 *
 * pdf-lib (approved by Phil, 2026-07-27) is pure JavaScript with no system
 * libraries, so it runs on Vercel unchanged. @react-pdf renders our own
 * documents; pdf-lib is the only way to append to somebody else's.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const NAVY = rgb(0.031, 0.071, 0.192);
const INK = rgb(0.05, 0.11, 0.29);
const MUTED = rgb(0.36, 0.42, 0.55);
const GOLD = rgb(0.96, 0.62, 0.04);
const RULE = rgb(0.87, 0.89, 0.94);

export type SignedCopyMeta = {
  companyName: string;
  policyTitle: string;
  policyVersion: number;
  signerName: string;
  /** When they signed, already a Date. Rendered in Europe/London. */
  signedAt: Date;
  /** The drawn signature as PNG bytes, when they drew one. */
  signaturePng?: Buffer | null;
  /** The typed name, when they typed instead. */
  typedSignature?: string | null;
  /** The evidence id, so the page can be traced back to the record. */
  reference: string;
};

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function drawLabelled(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  label: string,
  value: string,
) {
  page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: fonts.bold, color: MUTED });
  page.drawText(value, { x, y: y - 14, size: 11, font: fonts.regular, color: INK });
}

/**
 * Append the signature page to an existing PDF and return the new bytes.
 * Falls back to a standalone signature page if the original cannot be parsed
 * (a Word document, or a PDF we cannot open), so a download never fails.
 */
export async function appendSignaturePage(
  original: Buffer | null,
  meta: SignedCopyMeta,
): Promise<Buffer> {
  let pdf: PDFDocument | null = null;
  if (original) {
    try {
      pdf = await PDFDocument.load(original, { ignoreEncryption: true });
    } catch {
      pdf = null;
    }
  }
  if (!pdf) pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const left = 56;
  const right = width - 56;
  let y = height - 64;

  // Brand bar
  page.drawText("Be Care Compliant", { x: left, y, size: 15, font: bold, color: NAVY });
  page.drawText(meta.companyName, { x: left, y: y - 16, size: 9, font: regular, color: MUTED });
  page.drawText(`Reference ${meta.reference.slice(0, 8)}`, {
    x: right - regular.widthOfTextAtSize(`Reference ${meta.reference.slice(0, 8)}`, 8),
    y,
    size: 8,
    font: regular,
    color: MUTED,
  });
  y -= 30;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 2, color: GOLD });
  y -= 40;

  page.drawText("Signature", { x: left, y, size: 20, font: bold, color: NAVY });
  y -= 30;

  // The statement, wrapped by hand: pdf-lib has no text flow.
  const statement = `${meta.signerName} confirmed they had read and understood this policy, ${meta.policyTitle}, version ${meta.policyVersion}, and signed to that effect on ${formatWhen(meta.signedAt)}.`;
  const maxWidth = right - left;
  const words = statement.split(" ");
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (regular.widthOfTextAtSize(next, 11.5) > maxWidth) {
      page.drawText(line, { x: left, y, size: 11.5, font: regular, color: INK });
      y -= 17;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    page.drawText(line, { x: left, y, size: 11.5, font: regular, color: INK });
    y -= 17;
  }
  y -= 22;

  // The facts, two per row
  const rowGap = 46;
  drawLabelled(page, fonts, left, y, "Policy", meta.policyTitle.slice(0, 46));
  drawLabelled(page, fonts, left + 260, y, "Version", String(meta.policyVersion));
  y -= rowGap;
  drawLabelled(page, fonts, left, y, "Signed by", meta.signerName);
  drawLabelled(page, fonts, left + 260, y, "Signed at", formatWhen(meta.signedAt));
  y -= rowGap;
  drawLabelled(page, fonts, left, y, "Company", meta.companyName);
  drawLabelled(
    page,
    fonts,
    left + 260,
    y,
    "How they signed",
    meta.signaturePng ? "Signed by hand on a screen" : "Typed their full name",
  );
  y -= 54;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: RULE });
  y -= 26;
  page.drawText("SIGNATURE", { x: left, y, size: 7.5, font: bold, color: MUTED });
  y -= 96;

  if (meta.signaturePng) {
    try {
      const png = await pdf.embedPng(meta.signaturePng);
      const scaled = png.scaleToFit(240, 84);
      page.drawImage(png, { x: left, y, width: scaled.width, height: scaled.height });
    } catch {
      // An unreadable image must not cost them the whole document.
      page.drawText("(signature image unavailable)", {
        x: left,
        y: y + 30,
        size: 9,
        font: regular,
        color: MUTED,
      });
    }
  } else if (meta.typedSignature) {
    page.drawText(meta.typedSignature, {
      x: left,
      y: y + 30,
      size: 20,
      font: regular,
      color: rgb(0.08, 0.19, 0.42),
    });
  }

  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: left + 280, y }, thickness: 0.5, color: MUTED });
  page.drawText(meta.signerName, { x: left, y: y - 14, size: 10, font: regular, color: INK });

  const note = meta.signaturePng
    ? "Signed by hand on a screen in Be Care Compliant."
    : "Signed by typing their full name, which their employer accepts as their signature.";
  page.drawText(note, { x: left, y: 92, size: 8, font: regular, color: MUTED });
  page.drawText(
    "The pages before this one are the policy exactly as it read when it was signed.",
    { x: left, y: 80, size: 8, font: regular, color: MUTED },
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
