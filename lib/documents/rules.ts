/**
 * Be Care Compliant — Documents on a People or Service User record (migration 0439). Pure and
 * IMPORTLESS, so node --test can load it and the browser and the server agree on every rule.
 *
 * Phil, 2026-10-09: a place on the record for an ad hoc document, "a copy of an email or a random
 * copy of a certificate", in a tile next to Updates with an Upload button and the number of
 * documents. Who may see, upload and remove lives in the database (0439, the Updates audience; a
 * Company Admin removes, with a reason).
 */

/** Files per upload. */
export const DOC_MAX_FILES = 10;
/** Per file: the same limit as Updates and a paper upload, enough for a phone photo or a scan. */
export const DOC_MAX_MB = 20;
export const DOC_MAX_BYTES = DOC_MAX_MB * 1024 * 1024;
export const DOC_TITLE_MAX = 120;
export const DOC_NOTE_MAX = 1000;

/** Photos, PDFs, Word, Excel, and a saved email (the "copy of an email" Phil described). */
export const DOC_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  txt: "text/plain",
};

export const DOC_ACCEPT = Object.keys(DOC_MIME).map((e) => `.${e}`).join(",");

export function docExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

export function docMimeType(name: string): string {
  return DOC_MIME[docExtension(name)] ?? "application/octet-stream";
}

/** Why one file will not do, or null when it will. */
export function docFileProblem(f: { name: string; size: number }): string | null {
  const name = String(f.name ?? "").trim() || "That file";
  if (!DOC_MIME[docExtension(name)]) {
    return `${name} cannot be uploaded. Upload a photo (JPG, PNG, HEIC), a PDF, a Word or Excel file, or a saved email (EML, MSG).`;
  }
  if (!(f.size > 0)) return `${name} is empty.`;
  if (f.size > DOC_MAX_BYTES) return `${name} is over ${DOC_MAX_MB} MB.`;
  return null;
}

/** Why a set of files will not do, or null when it will. */
export function docFilesProblem(files: Array<{ name: string; size: number }>): string | null {
  if (files.length === 0) return "Choose a file to upload.";
  if (files.length > DOC_MAX_FILES) return `Upload up to ${DOC_MAX_FILES} files at a time.`;
  for (const f of files) {
    const p = docFileProblem(f);
    if (p) return p;
  }
  return null;
}

/** The name a document starts with: its file name, tidied. "Email_from_council.pdf" becomes "Email from council". */
export function docTitleFromFileName(name: string): string {
  const stem = String(name ?? "").trim().replace(/\.[a-z0-9]{1,8}$/i, "");
  const tidy = stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (tidy || "Document").slice(0, DOC_TITLE_MAX).trim();
}

/** Why a document's name will not do, or null when it will. */
export function docTitleProblem(title: string): string | null {
  const t = String(title ?? "").trim();
  if (!t) return "Give each document a short name.";
  if (t.length > DOC_TITLE_MAX) return `A document's name can be up to ${DOC_TITLE_MAX} characters.`;
  return null;
}

function safeName(name: string): string {
  return String(name ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

/**
 * Where a document's file is kept in the private record-documents bucket. The upload's own id is
 * the folder, which is what the database checks every saved path against.
 */
export function docFilePath(companyId: string, batchId: string, n: number, name: string): string {
  return `${companyId}/${batchId}/${n}-${safeName(name)}`;
}

/** "1 document", "3 documents". */
export function docCountLabel(n: number): string {
  return `${n} ${n === 1 ? "document" : "documents"}`;
}

/** "320 KB", "4.2 MB": a file's size as a person reads it. */
export function docSizeLabel(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ---------------------------------------------------------------------------------------------
 * A CERTIFICATE FOR A TRAINING COURSE, chosen from the same Upload (Phil, 2026-10-09: "they can
 * choose ad hoc. Or they can choose one of the training courses to upload a certificate for
 * that"). It is saved by the Training register's own save, onto the course, with the date
 * completed, so the rules here are that save's: one file, a certificate's kinds of file, and under
 * 4 MB because it travels in the save itself (the server action limit in next.config).
 * ------------------------------------------------------------------------------------------- */

export const CERT_EXTENSIONS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "heic", "heif"] as const;
export const CERT_ACCEPT = CERT_EXTENSIONS.map((e) => `.${e}`).join(",");
/** Decimal, so the file and the rest of the save stay inside the 4mb server action limit. */
export const CERT_MAX_BYTES = 4_000_000;

/** Why these files will not do as one course's certificate, or null when they will. */
export function certFilesProblem(files: Array<{ name: string; size: number }>): string | null {
  if (files.length === 0) return "Choose the certificate to upload.";
  if (files.length > 1) return "A course takes one certificate. Choose a single file.";
  const f = files[0];
  const name = String(f.name ?? "").trim() || "That file";
  if (!(CERT_EXTENSIONS as readonly string[]).includes(docExtension(name))) {
    return `${name} cannot be a certificate. Upload a PDF, a Word file or a photo (JPG, PNG, HEIC).`;
  }
  if (!(f.size > 0)) return `${name} is empty.`;
  if (f.size >= CERT_MAX_BYTES) return `${name} is too big for a certificate. It must be under 4 MB.`;
  return null;
}

/**
 * The booking left on the course once the certificate is saved. A booking on or before the date
 * completed is the course that has just been done, so it goes; a later one is a refresher already
 * booked, so it stays.
 */
export function bookingAfterCertificate(bookedFor: string | null | undefined, completedIso: string): string | null {
  if (!bookedFor) return null;
  return bookedFor > completedIso ? bookedFor : null;
}
