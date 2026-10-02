/**
 * Be Care Compliant — AI form import, the pure half (Phil, 2 Oct 2026).
 *
 * "a ai import, so i can put a link to a form in or upload a pdf, word, excel or picture".
 * The AI reads the source and drafts the form in the builder; nothing is saved until the person
 * presses Save. This file holds everything that does not talk to the network or the database, so
 * it can be unit tested: what we accept, how Word and Excel files are read without a new library
 * (they are zip files of XML, and fflate is already a dependency), how a web page is turned into
 * text, and how whatever the model returns is made into a schema the builder can trust.
 *
 * Isomorphic and import free at runtime apart from fflate: type imports only.
 */

import { unzipSync, strFromU8 } from "fflate";
import type { FieldType, FormField, FormSchema, FormSection } from "../form-schema";

/** 3.5 MB: a server action body is capped at 4 MB, and the file travels inside the form post. */
export const AI_IMPORT_MAX_BYTES = 3.5 * 1024 * 1024;

export type ImportKind = "pdf" | "image" | "docx" | "xlsx" | "text";

/** What a file is, from its name and type; null when we cannot read it, with the reason. */
export function importKindOf(name: string, type: string): { kind: ImportKind; mediaType: string } | { error: string } {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  if (ext === "pdf" || type === "application/pdf") return { kind: "pdf", mediaType: "application/pdf" };
  if (ext === "png" || type === "image/png") return { kind: "image", mediaType: "image/png" };
  if (ext === "jpg" || ext === "jpeg" || type === "image/jpeg") return { kind: "image", mediaType: "image/jpeg" };
  if (ext === "webp" || type === "image/webp") return { kind: "image", mediaType: "image/webp" };
  if (ext === "gif" || type === "image/gif") return { kind: "image", mediaType: "image/gif" };
  if (ext === "docx") return { kind: "docx", mediaType: "text/plain" };
  if (ext === "xlsx") return { kind: "xlsx", mediaType: "text/plain" };
  if (ext === "csv" || ext === "txt") return { kind: "text", mediaType: "text/plain" };
  if (ext === "heic" || ext === "heif") {
    return { error: "That photo is in the iPhone HEIC format. Take a screenshot of it, or set the camera to Most Compatible, and upload the JPG or PNG." };
  }
  if (ext === "doc") return { error: "That is an old style Word file (.doc). Save it as .docx or PDF and upload that." };
  if (ext === "xls") return { error: "That is an old style Excel file (.xls). Save it as .xlsx or PDF and upload that." };
  return { error: "Upload a PDF, a Word file (.docx), an Excel file (.xlsx) or a picture (JPG or PNG)." };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** The text of a Word file: one line per paragraph, table cells separated by " | ". */
export function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That Word file has no document inside it.");
  const doc = strFromU8(xml);
  return decodeXml(
    doc
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s*\|\s*$/, "").trim())
    .filter((l) => l !== "")
    .join("\n");
}

/** The text of an Excel file: each sheet, each row as tab separated cells. */
export function xlsxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || f.name === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name),
  });
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const si of strFromU8(ss).match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
    }
  }
  const sheetNames = files["xl/workbook.xml"]
    ? (strFromU8(files["xl/workbook.xml"]).match(/<sheet [^>]*name="([^"]*)"/g) ?? []).map((m) => decodeXml(/name="([^"]*)"/.exec(m)![1]))
    : [];
  const sheets = Object.keys(files)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]));
  const out: string[] = [];
  sheets.forEach((name, i) => {
    out.push(`Sheet: ${sheetNames[i] ?? `Sheet ${i + 1}`}`);
    for (const row of strFromU8(files[name]).match(/<row[\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const isShared = /\st="s"/.test(c);
        const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c);
        const v = /<v>([\s\S]*?)<\/v>/.exec(c);
        if (inline) cells.push(decodeXml(inline[1]));
        else if (v) cells.push(isShared ? (shared[Number(v[1])] ?? "") : decodeXml(v[1]));
      }
      const line = cells.map((x) => x.trim()).filter((x) => x !== "").join("\t");
      if (line) out.push(line);
    }
  });
  return out.join("\n");
}

/**
 * A web page as text the model can read. Scripts and styles go, EXCEPT the data a Google Form
 * keeps its questions in (FB_PUBLIC_LOAD_DATA_), which is the only place a Google Form's questions
 * are written down in the page before it runs.
 */
export function htmlText(html: string): string {
  const googleData = /FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/.exec(html)?.[1] ?? "";
  const title = decodeXml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");
  const body = decodeXml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/label|\/option)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n");
  return [title ? `Page title: ${title}` : "", body, googleData ? `Google Form data: ${googleData}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

/** Refuses a link we must not fetch: not http(s), or a name or address that points inside a network. */
export function linkProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That is not a full web address. Copy it from the address bar, starting https://";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Use a web address starting https://";
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host) ||
    !host.includes(".")
  ) {
    return "That address is not a public web page.";
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * What the model returns, made safe.
 * ------------------------------------------------------------------------- */

/** The field types the AI may use: everything a paper form can hold, nothing that needs wiring. */
export const AI_FIELD_TYPES: FieldType[] = [
  "short_text",
  "long_text",
  "number",
  "date",
  "time",
  "email",
  "phone",
  "address",
  "yes_no",
  "single_select",
  "multi_select",
  "radio",
  "checkbox",
  "rating",
  "signature",
  "file_upload",
  "heading",
];

const CHOICE: FieldType[] = ["single_select", "multi_select", "radio"];

/** What an imported question should be filled in with, judged from its wording. */
export function prefillFor(label: string, type: FieldType): FormField["prefill"] | undefined {
  const l = label.toLowerCase();
  const text = type === "short_text" || type === "long_text";
  if (text && /\b(auditor'?s?|assessor'?s?|reviewer'?s?|supervisor'?s?|completed by|carried out by|conducted by|reviewed by)\b.*\bname\b|\b(completed|carried out|conducted|reviewed) by\b/.test(l)) {
    return "completed_by";
  }
  if ((text || type === "single_select" || type === "radio") && /^(branch|location|office|branch\s*\/\s*location|branch or location)\b/.test(l)) {
    return "record_branch";
  }
  if (text && /\b(service user'?s?|client'?s?|staff( member)?'?s?|employee'?s?|carer'?s?|person'?s?)\s+(full\s+)?name\b/.test(l)) {
    return "record_name";
  }
  return undefined;
}

export type AiDraft = { name: string | null; schema: FormSchema; questions: number; notes: string[] };

function slug(s: string, fallback: string): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/, "");
  return /^[a-z]/.test(out) ? out : out ? `q_${out}` : fallback;
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** The first JSON object in the reply, with or without a ``` fence round it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Turns the model's draft into a schema the builder and validator accept: known types only,
 * unique lowercase keys, choice questions with at least two options, sections with titles.
 * Anything it cannot use becomes a plain text question and is listed in the notes.
 * `takenKeys` are keys already in the form when the draft is added after existing questions.
 */
export function draftToSchema(raw: unknown, takenKeys: string[] = [], idSeed = Date.now().toString(36)): AiDraft {
  const notes: string[] = [];
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const keys = new Set(takenKeys);
  const sections: FormSection[] = [];
  let questions = 0;
  let changedType = 0;
  /* Every question so far, by its label, so a later "show this only when" can point at it. */
  const byLabel = new Map<string, FormField>();
  const askedTwice: string[] = [];
  let previous: FormField | null = null;
  const pendingShowWhen: Array<{ field: FormField; question: string; answers: string[] }> = [];

  rawSections.slice(0, 40).forEach((rs, si) => {
    const s = (rs && typeof rs === "object" ? rs : {}) as Record<string, unknown>;
    const fields: FormField[] = [];
    const rawFields = Array.isArray(s.fields) ? s.fields : [];
    for (const rf of rawFields.slice(0, 120)) {
      const f = (rf && typeof rf === "object" ? rf : {}) as Record<string, unknown>;
      const label = clean(f.label, 300);
      if (!label) continue;
      let type = (typeof f.type === "string" ? f.type : "short_text") as FieldType;
      if (!AI_FIELD_TYPES.includes(type)) {
        type = "short_text";
        changedType += 1;
      }
      const options = Array.isArray(f.options)
        ? [...new Set(f.options.map((o) => clean(typeof o === "object" && o ? (o as { label?: unknown }).label : o, 120)).filter(Boolean))]
        : [];
      if (CHOICE.includes(type) && options.length < 2) {
        type = options.length === 0 && /\b(yes|no)\b/i.test(label) ? "yes_no" : "short_text";
        changedType += 1;
      }
      /* A COMMENTS BOX IS "Comments" (Phil, 2 Oct 2026, on the Birdie audit): the box under a
         question took the whole question as its label ("Are care plans updated ...? Comments"). */
      let shownLabel = label;
      const commentish = /\b(comments?|notes?)\.?$/i.test(label);
      if (commentish && (type === "long_text" || type === "short_text") && previous && previous.type !== "heading") {
        const stem = label.replace(/[.\s]*\b(comments?|notes?)\.?$/i, "").trim().toLowerCase();
        if (stem === "" || previous.label.toLowerCase().startsWith(stem) || stem.startsWith(previous.label.toLowerCase().replace(/[?.]$/, ""))) {
          shownLabel = "Comments";
        }
      }
      const norm = shownLabel.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (shownLabel !== "Comments" && type !== "heading" && byLabel.has(norm) && !askedTwice.includes(shownLabel)) {
        askedTwice.push(shownLabel);
      }
      const base = shownLabel === "Comments" && previous ? `${previous.key}_comments` : slug(label, `question_${questions + 1}`);
      let key = base;
      let n = 2;
      while (keys.has(key)) key = `${base}_${n++}`;
      keys.add(key);
      const field: FormField = { key, type, label: shownLabel };
      if (f.required === true && type !== "heading") field.required = true;
      /* FILLED IN AUTOMATICALLY where the question plainly asks for something the system already
         knows (Phil, 2 Oct 2026, on the Platform Audit's Auditors Name and Branch/Location). */
      const pf = prefillFor(shownLabel, type);
      if (pf) field.prefill = pf;
      const help = clean(f.help, 400);
      if (help) field.help = help;
      if (CHOICE.includes(type)) {
        const used = new Set<string>();
        field.options = options.slice(0, 40).map((label, i) => {
          let value = slug(label, `option_${i + 1}`);
          let m = 2;
          while (used.has(value)) value = `${slug(label, `option_${i + 1}`)}_${m++}`;
          used.add(value);
          return { value, label };
        });
      }
      /* SHOWN ONLY WHEN NEEDED (Phil, 2 Oct 2026): "Follow-Up Date" after "Follow-Up Required". The
         model names the earlier question and the answers that show this one; resolved below,
         once every question has its key. */
      const sw = (f.showWhen && typeof f.showWhen === "object" ? f.showWhen : null) as { question?: unknown; answers?: unknown } | null;
      if (sw && typeof sw.question === "string" && Array.isArray(sw.answers)) {
        pendingShowWhen.push({ field, question: sw.question, answers: sw.answers.filter((a): a is string => typeof a === "string") });
      }
      if (type !== "heading") questions += 1;
      if (shownLabel !== "Comments" && type !== "heading" && !byLabel.has(norm)) byLabel.set(norm, field);
      previous = field;
      fields.push(field);
    }
    if (fields.length === 0) return;
    sections.push({
      id: `section-ai-${idSeed}-${si + 1}`,
      title: clean(s.title, 120) || `Section ${sections.length + 1}`,
      ...(clean(s.description, 600) ? { description: clean(s.description, 600) } : {}),
      fields,
    });
  });

  let conditional = 0;
  for (const p of pendingShowWhen) {
    const target = byLabel.get(p.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    if (!target || target === p.field) continue;
    let values: string[];
    if (target.type === "yes_no" || target.type === "checkbox") {
      values = p.answers.map((a) => a.trim().toLowerCase()).filter((a) => a === "yes" || a === "no");
    } else if (target.options?.length) {
      values = p.answers
        .map((a) => target.options!.find((o) => o.label.toLowerCase() === a.trim().toLowerCase())?.value)
        .filter((v): v is string => Boolean(v));
    } else continue;
    if (values.length === 0) continue;
    p.field.visibleWhen = { field: target.key, in: [...new Set(values)] };
    conditional += 1;
  }
  if (conditional > 0) {
    notes.push(`${conditional} question${conditional === 1 ? " shows" : "s show"} only when an earlier answer needs ${conditional === 1 ? "it" : "them"}.`);
  }
  if (askedTwice.length > 0) {
    notes.push(`Asked twice: ${askedTwice.map((l) => `"${l}"`).join(", ")}. Remove the repeat if it is not meant to be there.`);
  }
  if (changedType > 0) {
    notes.push(`${changedType} question${changedType === 1 ? " was" : "s were"} set to a simpler answer type. Check ${changedType === 1 ? "it" : "them"}.`);
  }
  const name = clean(obj.name, 120) || null;
  return { name, schema: { schemaVersion: 1, sections }, questions, notes };
}

/** The instruction the model is given. Our vocabulary, no dashes, JSON only. */
export function aiImportSystem(population: string): string {
  return [
    "You turn a care provider's existing form into a structured form for Be Care Compliant, a UK care compliance system.",
    `The form will be completed about ${population === "service_users" ? "a service user (a person receiving care)" : population === "people" ? "a member of staff" : "a record in the system"}.`,
    "Copy the questions faithfully, in their original order and wording, grouped into the sections the source uses. Do not invent questions that are not in the source, and do not drop any.",
    "Leave out things that are not questions: logos, page numbers, office use stamps and filing instructions. Keep instructions that help someone answer as the help text of the question they belong to, or as a heading.",
    `Use only these answer types: ${AI_FIELD_TYPES.join(", ")}.`,
    "Guidance: tick boxes with several choices where one is picked are radio or single_select; where several can be picked, multi_select; a single tick box to confirm something is checkbox; Yes or No questions are yes_no; a signature line is signature; a date line is date; a box for writing is long_text, a short line is short_text; star or 1 to 5 scores are rating; a printed heading or instruction with no answer is heading.",
    "Mark a question required only when the source says it must be answered (for example an asterisk or the word required).",
    "Where the source has a comments or notes box for a question, add it straight after that question as long_text with the label Comments.",
    'Where a question only applies after an earlier answer (for example a follow up date after "Follow up required: Yes"), add "showWhen": {"question": "the earlier question label exactly", "answers": ["Yes"]} to it.',
    "Use UK spelling. Never use dashes as punctuation in labels: use commas, colons and full stops. Never use the words item or board.",
    'Reply with JSON only, no other text, in exactly this shape: {"name": "form name", "sections": [{"title": "section title", "description": "optional", "fields": [{"label": "question as asked", "type": "one of the types", "required": false, "help": "optional", "options": ["only for radio, single_select and multi_select"], "showWhen": {"question": "optional", "answers": ["optional"]}}]}]}',
  ].join("\n");
}
