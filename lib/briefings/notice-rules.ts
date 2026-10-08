/**
 * Be Care Compliant — memos, messages and attachments sent as a Briefing (Phil, 2026-10-08:
 * "at the moment we can send out policies... i would like to expand it, so that attachments,
 * memos and messages can be sent out"). Pure and IMPORTLESS, so node --test can load it and the
 * browser and the server agree on the same rules.
 *
 *   Memo       : a title and a longer piece of writing, kept as a PDF on the company letterhead.
 *   Message    : a short note. No PDF.
 *   Attachment : a title, a short note, and up to three files.
 * Any of them can carry files.
 *
 * What the person must do is chosen per notice: just read it, read it and press "I have read
 * this", or sign it.
 */

export type NoticeKind = "memo" | "message" | "attachment";
export type NoticeResponse = "read" | "confirm" | "sign";

export const NOTICE_KINDS: NoticeKind[] = ["memo", "message", "attachment"];
export const NOTICE_RESPONSES: NoticeResponse[] = ["read", "confirm", "sign"];

export type NoticeFile = { path: string; name: string; size: number; type: string };

export const NOTICE_KIND_LABELS: Record<NoticeKind, string> = {
  memo: "Memo",
  message: "Message",
  attachment: "Attachment",
};

/** What the manager picks, worded as the instruction. */
export const NOTICE_RESPONSE_LABELS: Record<NoticeResponse, string> = {
  read: "Just read it",
  confirm: "Read and press \"I have read this\"",
  sign: "Sign it",
};

/** What the person is asked to do, on their own list. */
export const NOTICE_RESPONSE_ASKS: Record<NoticeResponse, string> = {
  read: "To read",
  confirm: "To read and confirm",
  sign: "To read and sign",
};

/** What the manager sees when it is done. */
export const NOTICE_RESPONSE_DONE: Record<NoticeResponse, string> = {
  read: "Read",
  confirm: "Confirmed",
  sign: "Signed",
};

export const NOTICE_MAX_FILES = 3;
export const NOTICE_MAX_MB = 10;
export const NOTICE_MAX_BYTES = NOTICE_MAX_MB * 1024 * 1024;
export const NOTICE_TITLE_MAX = 200;
/** A message is a short note; a memo can run to a few pages. The database refuses more than 20000. */
export const NOTICE_BODY_MAX: Record<NoticeKind, number> = { memo: 20000, message: 2000, attachment: 2000 };

/** PDF, Word, Excel and pictures (Phil, 2026-10-08). */
export const NOTICE_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
};

export const NOTICE_ACCEPT = Object.keys(NOTICE_MIME).map((e) => `.${e}`).join(",");

export function noticeExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

export function noticeMimeType(name: string): string {
  return NOTICE_MIME[noticeExtension(name)] ?? "application/octet-stream";
}

export function isNoticeKind(v: unknown): v is NoticeKind {
  return typeof v === "string" && (NOTICE_KINDS as string[]).includes(v);
}

export function isNoticeResponse(v: unknown): v is NoticeResponse {
  return typeof v === "string" && (NOTICE_RESPONSES as string[]).includes(v);
}

/** Why one file will not do, or null when it will. */
export function noticeFileProblem(f: { name: string; size: number }): string | null {
  const name = String(f.name ?? "").trim() || "That file";
  if (!NOTICE_MIME[noticeExtension(name)]) {
    return `${name} cannot be attached. Attach a PDF, a Word or Excel file, or a picture.`;
  }
  if (!(f.size > 0)) return `${name} is empty.`;
  if (f.size > NOTICE_MAX_BYTES) return `${name} is over ${NOTICE_MAX_MB} MB.`;
  return null;
}

export function noticeFilesProblem(files: Array<{ name: string; size: number }>): string | null {
  if (files.length > NOTICE_MAX_FILES) return `Attach up to ${NOTICE_MAX_FILES} files.`;
  for (const f of files) {
    const p = noticeFileProblem(f);
    if (p) return p;
  }
  return null;
}

/** Why the notice as written will not do, or null when it will. */
export function noticeProblem(n: { kind: string; title: string; body: string; fileCount: number }): string | null {
  if (!isNoticeKind(n.kind)) return "Choose a memo, a message or an attachment.";
  const title = String(n.title ?? "").trim();
  const body = String(n.body ?? "").trim();
  if (!title) return "Give it a title.";
  if (title.length > NOTICE_TITLE_MAX) return `Keep the title under ${NOTICE_TITLE_MAX} characters.`;
  if (body.length > NOTICE_BODY_MAX[n.kind]) {
    return n.kind === "memo"
      ? `A memo can be up to ${NOTICE_BODY_MAX.memo} characters.`
      : `A ${n.kind === "message" ? "message" : "note"} can be up to ${NOTICE_BODY_MAX[n.kind]} characters. Send a memo for something longer.`;
  }
  if (n.kind === "memo" && !body) return "Write the memo.";
  if (n.kind === "message" && !body) return "Write the message.";
  if (n.kind === "attachment" && n.fileCount === 0) return "Attach at least one file.";
  if (n.fileCount > NOTICE_MAX_FILES) return `Attach up to ${NOTICE_MAX_FILES} files.`;
  return null;
}

function safeName(name: string): string {
  return String(name ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

/** Where an attachment lives in the private evidence bucket. The notice id is the folder. */
export function noticeFilePath(companyId: string, noticeId: string, n: number, name: string): string {
  return `${companyId}/notices/${noticeId}/${n}-${safeName(name)}`;
}

/** The email subject, by what it is and what is asked. */
export function noticeSubject(kind: NoticeKind, response: NoticeResponse, title: string): string {
  if (response === "sign") return `Please read and sign: ${title}`;
  if (kind === "memo") return `New memo: ${title}`;
  if (kind === "message") return `New message: ${title}`;
  return `Documents for you: ${title}`;
}

/** Paragraphs as typed: a blank line starts a new one, a single line break stays a line break. */
export function noticeParagraphs(body: string | null | undefined): string[] {
  return String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+\n/g, "\n").trim())
    .filter((p) => p.length > 0);
}

export function fileSizeLabel(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
