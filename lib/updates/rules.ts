/**
 * Be Care Compliant — Updates on a record (People and Service Users). Pure and IMPORTLESS, so
 * node --test can load it.
 *
 * WHAT IT IS (Phil, 2026-09-24): "a bit like the update section on Monday... on their record...
 * for people and service user... I think update section is a better option." The rules about WHO
 * may read, post, edit, pin and remove live in the database (0324); this file holds the rules
 * the browser and the server both need to agree on: what may be attached, how a thread is
 * ordered, and what the tile shows.
 */

/** Attachments per update. */
export const UPDATE_MAX_FILES = 5;
/** Per file. The same limit as a paper upload: a phone photo is 3 to 6 MB. */
export const UPDATE_MAX_MB = 20;
export const UPDATE_MAX_BYTES = UPDATE_MAX_MB * 1024 * 1024;
/** Characters per update. The database refuses more. */
export const UPDATE_MAX_CHARS = 5000;

export const UPDATE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** What the picker offers: photos, PDFs, Word and Excel (Phil, 2026-09-24). */
export const UPDATE_ACCEPT = Object.keys(UPDATE_MIME).map((e) => `.${e}`).join(",");

export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

export function updateMimeType(name: string): string {
  return UPDATE_MIME[fileExtension(name)] ?? "application/octet-stream";
}

/** Why one file will not do, or null when it will. */
export function updateFileProblem(f: { name: string; size: number }): string | null {
  const name = String(f.name ?? "").trim() || "That file";
  if (!UPDATE_MIME[fileExtension(name)]) {
    return `${name} cannot be attached. Attach a photo (JPG, PNG, HEIC), a PDF, a Word or an Excel file.`;
  }
  if (!(f.size > 0)) return `${name} is empty.`;
  if (f.size > UPDATE_MAX_BYTES) return `${name} is over ${UPDATE_MAX_MB} MB.`;
  return null;
}

/** Why a set of files will not do, or null when it will. */
export function updateFilesProblem(files: Array<{ name: string; size: number }>): string | null {
  if (files.length > UPDATE_MAX_FILES) return `Attach up to ${UPDATE_MAX_FILES} files to an update.`;
  for (const f of files) {
    const p = updateFileProblem(f);
    if (p) return p;
  }
  return null;
}

/** Why the words and files together will not do, or null when they will. */
export function updatePostProblem(body: string, fileCount: number): string | null {
  const text = String(body ?? "").trim();
  if (!text && fileCount === 0) return "Write something or attach a file.";
  if (text.length > UPDATE_MAX_CHARS) return `An update can be up to ${UPDATE_MAX_CHARS} characters.`;
  return null;
}

function safeName(name: string): string {
  return String(name ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

/**
 * Where an attachment is kept in the private record-updates bucket. The update's own id is the
 * folder, which is what the database checks every attached path against.
 */
export function updateFilePath(companyId: string, updateId: string, n: number, name: string): string {
  return `${companyId}/${updateId}/${n}-${safeName(name)}`;
}

export type UpdateRow = {
  id: string;
  parentId: string | null;
  createdAt: string;
  pinnedAt: string | null;
  removedAt: string | null;
  body: string;
};

export type Thread<T extends UpdateRow> = { update: T; replies: T[] };

/**
 * The thread as it is read. The pinned update first, then every other update OLDEST AT THE TOP
 * and newest at the bottom (the standing rule for every timeline in the product), each with its
 * replies under it, oldest first. A reply whose update cannot be seen is dropped rather than
 * shown on its own.
 */
export function orderThreads<T extends UpdateRow>(rows: T[]): Thread<T>[] {
  const byTime = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const tops = rows.filter((r) => !r.parentId).sort(byTime);
  const replies = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = replies.get(r.parentId);
    if (list) list.push(r);
    else replies.set(r.parentId, [r]);
  }
  const threads = tops.map((u) => ({ update: u, replies: (replies.get(u.id) ?? []).sort(byTime) }));
  const pinned = threads.filter((t) => t.update.pinnedAt && !t.update.removedAt);
  const rest = threads.filter((t) => !(t.update.pinnedAt && !t.update.removedAt));
  return [...pinned, ...rest];
}

/**
 * What the tile shows: the pinned update, or else the newest one still standing. Replies are not
 * shown on the tile; they are part of their update.
 */
export function tileUpdate<T extends UpdateRow>(rows: T[]): T | null {
  const standing = rows.filter((r) => !r.parentId && !r.removedAt);
  const pinned = standing.find((r) => r.pinnedAt);
  if (pinned) return pinned;
  return standing.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
}

/** How many updates the tile counts: every update and reply still standing. */
export function updateCount(rows: UpdateRow[]): number {
  return rows.filter((r) => !r.removedAt).length;
}

/** A body cut to a length for the tile, on a word, with an ellipsis when it was cut. */
export function previewText(body: string, max = 140): string {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The @names still present in the words, so a mention deleted from the text before posting is
 * not emailed. Matched on the whole name after an @, case sensitive, as the picker inserts it.
 */
export function mentionedIds(body: string, picked: Array<{ id: string; name: string }>): string[] {
  const text = String(body ?? "");
  const seen = new Set<string>();
  for (const p of picked) {
    if (!p.name) continue;
    if (text.includes(`@${p.name}`)) seen.add(p.id);
  }
  return [...seen];
}

/** The body split into plain text and @mention parts, for drawing the mentions highlighted. */
export function splitMentions(body: string, names: string[]): Array<{ text: string; mention: boolean }> {
  const text = String(body ?? "");
  const wanted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [{ text, mention: false }];
  const parts: Array<{ text: string; mention: boolean }> = [];
  let i = 0;
  let plain = "";
  while (i < text.length) {
    if (text[i] === "@") {
      const hit = wanted.find((n) => text.startsWith(n, i + 1));
      if (hit) {
        if (plain) parts.push({ text: plain, mention: false });
        plain = "";
        parts.push({ text: `@${hit}`, mention: true });
        i += hit.length + 1;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  if (plain) parts.push({ text: plain, mention: false });
  return parts;
}

/**
 * The @ being typed at the caret, if any: the text after the last @ that starts a word, up to the
 * caret, with no line break in it. Null when the caret is not in a mention.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = String(text ?? "").slice(0, Math.max(0, caret));
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/[\n\r]/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

/** When an update was written, in UK time: "24/09/2026 09:14". */
export function updateStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** A file's size for a person to read. */
export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
