/*
 * What may be attached to Evidence (audit S10, 4 Oct 2026). Pure, so it is unit tested.
 *
 * Evidence files are handed back to inspectors and managers through signed links, so a file is
 * only taken when it is a picture, a PDF, an Office document or plain text, judged on BOTH the
 * type the browser claimed and the file's own name. Anything that a browser would run rather
 * than show (HTML, SVG, scripts) is refused, as is anything over the size cap.
 */

export const EVIDENCE_FILE_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
  heif: ["image/heif", "image/heic"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  txt: ["text/plain"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
};

/** Some phones and browsers send no type at all; the name then decides. */
const UNKNOWN = new Set(["", "application/octet-stream"]);

export function attachmentProblem(file: { fileName: string; contentType: string; size: number; kind?: string }): string | null {
  const name = file.fileName || "that file";
  if (file.size <= 0) return `${name} is empty.`;
  if (file.size > EVIDENCE_FILE_MAX_BYTES) return `${name} is larger than 20 MB. Attach a smaller copy.`;
  const ext = (/\.([a-z0-9]+)$/i.exec(file.fileName)?.[1] ?? "").toLowerCase();
  const type = (file.contentType || "").toLowerCase().split(";")[0].trim();
  // A drawn signature is made by the app itself, always a PNG.
  if (file.kind === "signature") return type === "image/png" ? null : "A signature could not be read. Sign again.";
  const allowed = ALLOWED[ext];
  if (!allowed) return `${name} is not a type we keep as Evidence. Attach a PDF, a photo, or a Word or Excel file.`;
  if (!UNKNOWN.has(type) && !allowed.includes(type)) {
    return `${name} does not look like the file its name says it is. Save it again and attach that copy.`;
  }
  return null;
}

/** The type to store it under: the browser's when it matched, otherwise the name's. */
export function storedContentType(file: { fileName: string; contentType: string; kind?: string }): string {
  if (file.kind === "signature") return "image/png";
  const ext = (/\.([a-z0-9]+)$/i.exec(file.fileName)?.[1] ?? "").toLowerCase();
  const type = (file.contentType || "").toLowerCase().split(";")[0].trim();
  const allowed = ALLOWED[ext] ?? [];
  return allowed.includes(type) ? type : allowed[0] ?? "application/octet-stream";
}
