/**
 * Be Care Compliant: the words of a letter, formatted (Phil, 2026-10-12, Job 2 Part B,
 * docs/decisions/letter-editor.md).
 *
 * A letter's text is now LETTER HTML: a small, fixed set of tags made by the editor (TipTap) and
 * nothing else. Paragraphs, Heading and Subheading, bulleted and numbered lists, line breaks, bold,
 * italic, underline, and a text size of Small, Normal or Large. Whatever arrives (a pasted Word
 * document, an old letter, a hand made request) is read through the same rules and written back
 * out in that set, so nothing else can ever reach a PDF, an email or the database.
 *
 * OLD LETTERS AND TEMPLATES KEEP WORKING: text that is not letter HTML is read as before. A blank
 * line starts a paragraph, each extra blank line adds space, a line starting with a bullet is a
 * list, and a paragraph made only of "Label: value" lines is the meeting details table.
 *
 * Pure and importless so node --test can load it, and safe in the browser.
 */

export type TextSize = "small" | "large";
export type Run = { text: string; b?: boolean; i?: boolean; u?: boolean; size?: TextSize };
export type Line = Run[];

export type RichBlock =
  | { kind: "para"; lines: Line[] }
  | { kind: "heading"; level: 2 | 3; lines: Line[] }
  | { kind: "list"; ordered: boolean; items: Line[][] }
  | { kind: "details"; rows: Array<{ label: string; value: string }> }
  | { kind: "space" };

/** Points on the PDF: Small, Normal, Large, and the two headings. Normal is 11 (Phil, 2026-10-12,
 *  Part C), the rest scaled with it. */
export const LETTER_SIZES = { small: 10, normal: 11, large: 13, h2: 15, h3: 12.5 } as const;

export const BULLET_CHAR = "•";

/* ------------------------------------------------------------------------------- escaping */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+|#39);/g, (whole, name: string) => {
    if (name in NAMED) return NAMED[name];
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const n = parseInt(name.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    if (name.startsWith("#")) {
      const n = parseInt(name.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return whole;
  });
}

/* ---------------------------------------------------------------------------- recognising */

/** Whether this text is letter HTML (made by the editor) rather than an old plain text letter. */
export function isLetterHtml(raw: string | null | undefined): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|div)[\s>]/i.test(String(raw ?? ""));
}

/* -------------------------------------------------------------------------------- parsing */

type Marks = { b: number; i: number; u: number; size: Array<TextSize | null> };

const SKIP_CONTENT = new Set(["script", "style", "title", "head", "xml", "template", "noscript"]);

function sizeFrom(attrs: string): TextSize | null {
  const m = /data-size\s*=\s*["']?(small|large)/i.exec(attrs);
  return m ? (m[1].toLowerCase() as TextSize) : null;
}

/**
 * Letter HTML (or any HTML at all) as blocks, keeping only what a letter allows. Tags it does not
 * know are dropped and their text kept; scripts, styles and the like are dropped with their text.
 */
export function parseLetterHtml(html: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const marks: Marks = { b: 0, i: 0, u: 0, size: [] };
  let cur: { kind: "para" | "heading"; level: 2 | 3; lines: Line[] } | null = null;
  // One level of list: a list inside a list is flattened into it.
  let list: { ordered: boolean; items: Line[][] } | null = null;
  let listDepth = 0;
  let item: Line[] | null = null;
  let itemHasPara = false;
  let skipping: string | null = null;

  const line = (): Line => {
    if (item) return item[item.length - 1];
    if (!cur) cur = { kind: "para", level: 2, lines: [[]] };
    return cur.lines[cur.lines.length - 1];
  };
  const endBlock = (emptyIsSpace: boolean) => {
    if (!cur) return;
    const hasText = cur.lines.some((l) => l.some((r) => r.text.trim()));
    if (hasText) {
      blocks.push(cur.kind === "heading" ? { kind: "heading", level: cur.level, lines: cur.lines } : { kind: "para", lines: cur.lines });
    } else if (emptyIsSpace && cur.kind === "para") {
      blocks.push({ kind: "space" });
    }
    cur = null;
  };
  const endList = () => {
    if (list) {
      const items = list.items.map(trimLines).filter((it) => it.some((l) => l.some((r) => r.text.trim())));
      if (items.length) blocks.push({ kind: "list", ordered: list.ordered, items });
    }
    list = null;
    listDepth = 0;
    item = null;
  };
  const addText = (text: string) => {
    if (!text) return;
    const run: Run = { text };
    if (marks.b > 0) run.b = true;
    if (marks.i > 0) run.i = true;
    if (marks.u > 0) run.u = true;
    for (let k = marks.size.length - 1; k >= 0; k--) {
      const sz = marks.size[k];
      if (sz) {
        run.size = sz;
        break;
      }
    }
    const l = line();
    const last = l[l.length - 1];
    if (last && last.b === run.b && last.i === run.i && last.u === run.u && last.size === run.size) last.text += text;
    else l.push(run);
  };

  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    const isText = m[4] !== undefined || m[0] === "<";
    const closing = m[1] === "/";
    const tag = (m[2] ?? "").toLowerCase();
    const attrs = m[3] ?? "";

    if (skipping) {
      if (!isText && closing && tag === skipping) skipping = null;
      continue;
    }
    if (isText) {
      // Text between tags: a run of spaces and line breaks is one space, as a browser shows it.
      const t = decodeEntities(m[4] ?? "<").replace(/\u00a0/g, " ").replace(/[ \t\r\n\f]+/g, " ");
      if (!cur && !item && !t.trim()) continue;
      if (list && !item) continue; // stray text between list items
      addText(t);
      continue;
    }
    if (SKIP_CONTENT.has(tag)) {
      if (!closing && !/\/\s*$/.test(attrs)) skipping = tag;
      continue;
    }

    switch (tag) {
      case "p":
      case "div":
      case "li":
        if (tag === "li" && list) {
          if (closing) item = null;
          else {
            item = [[]];
            itemHasPara = false;
            list.items.push(item);
          }
        } else if (item) {
          if (!closing) {
            if (itemHasPara) item.push([]);
            itemHasPara = true;
          }
        } else if (closing) endBlock(true);
        else {
          if (list) endList();
          endBlock(false);
          cur = { kind: "para", level: 2, lines: [[]] };
        }
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (item) break;
        if (closing) endBlock(false);
        else {
          if (list) endList();
          endBlock(false);
          cur = { kind: "heading", level: tag === "h1" || tag === "h2" ? 2 : 3, lines: [[]] };
        }
        break;
      case "br":
        if (item) item.push([]);
        else {
          line();
          cur!.lines.push([]);
        }
        break;
      case "ul":
      case "ol":
        if (closing) {
          listDepth = Math.max(0, listDepth - 1);
          if (listDepth === 0) endList();
          else item = null;
        } else {
          if (listDepth === 0) {
            endBlock(false);
            list = { ordered: tag === "ol", items: [] };
          }
          listDepth += 1;
          item = null;
        }
        break;
      case "strong":
      case "b":
        marks.b = Math.max(0, marks.b + (closing ? -1 : 1));
        break;
      case "em":
      case "i":
        marks.i = Math.max(0, marks.i + (closing ? -1 : 1));
        break;
      case "u":
        marks.u = Math.max(0, marks.u + (closing ? -1 : 1));
        break;
      case "span":
        if (closing) marks.size.pop();
        else marks.size.push(sizeFrom(attrs) as TextSize);
        break;
      default:
        break;
    }
  }
  endBlock(false);
  endList();
  return trimSpaces(blocks.map((b) => (b.kind === "para" || b.kind === "heading" ? { ...b, lines: trimLines(b.lines) } : b)));
}

function trimRunEnds(l: Line): Line {
  const out = l.map((r) => ({ ...r }));
  while (out.length && !out[0].text.replace(/^\s+/, "")) out.shift();
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, "");
  while (out.length && !out[out.length - 1].text.replace(/\s+$/, "")) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  return out;
}

function trimLines(lines: Line[]): Line[] {
  const out = lines.map(trimRunEnds);
  while (out.length > 1 && !out[0].length) out.shift();
  while (out.length > 1 && !out[out.length - 1].length) out.pop();
  return out;
}

function trimSpaces(blocks: RichBlock[]): RichBlock[] {
  const out = [...blocks];
  while (out.length && out[0].kind === "space") out.shift();
  while (out.length && out[out.length - 1].kind === "space") out.pop();
  return out;
}

/* ---------------------------------------------------------------------- old plain text letters */

const BULLET_LINE = /^\s*[•*]\s+(.*)$/;
const NUMBER_LINE = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const DETAIL_LINE = /^([A-Za-z][A-Za-z ]{0,13}):\s+(\S.*)$/;

const plainRun = (text: string): Line => (text ? [{ text }] : []);

/** An old plain text letter or template as blocks, by the rules it was always read with. */
export function plainTextBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let para: string[] = [];
  let broke = false;
  const flush = () => {
    if (!para.length) return;
    let run: string[] = [];
    let list: { ordered: boolean; items: Line[][] } | null = null;
    const endRun = () => {
      if (run.length) blocks.push({ kind: "para", lines: run.map((l) => plainRun(l)) });
      run = [];
    };
    const endList = () => {
      if (list && list.items.length) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    };
    for (const line of para) {
      const bullet = line.match(BULLET_LINE);
      if (bullet) {
        endRun();
        if (!list || list.ordered) {
          endList();
          list = { ordered: false, items: [] };
        }
        list.items.push([plainRun(bullet[1].trim())]);
      } else {
        endList();
        run.push(line.trim());
      }
    }
    endRun();
    endList();
    para = [];
  };
  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      if (para.length) {
        flush();
        broke = true;
      } else if (broke) {
        blocks.push({ kind: "space" });
      }
    } else {
      para.push(line.replace(/\s+$/, ""));
    }
  }
  flush();
  return trimSpaces(blocks);
}

/** Any letter text, new or old, as blocks. */
export function letterBlocksOf(raw: string | null | undefined): RichBlock[] {
  const s = String(raw ?? "");
  return isLetterHtml(s) ? parseLetterHtml(s) : plainTextBlocks(s);
}

/* ------------------------------------------------------------------------------- writing out */

function runHtml(r: Run): string {
  let t = escapeHtml(r.text);
  if (r.u) t = `<u>${t}</u>`;
  if (r.i) t = `<em>${t}</em>`;
  if (r.b) t = `<strong>${t}</strong>`;
  if (r.size) t = `<span data-size="${r.size}">${t}</span>`;
  return t;
}

const linesHtml = (lines: Line[]) => lines.map((l) => l.map(runHtml).join("")).join("<br>");

/** Blocks as letter HTML: the one form that is stored, posted and drawn. */
export function blocksToLetterHtml(blocks: RichBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "para":
          return `<p>${linesHtml(b.lines)}</p>`;
        case "heading":
          return `<h${b.level}>${linesHtml(b.lines)}</h${b.level}>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((it) => `<li><p>${linesHtml(it)}</p></li>`).join("")}</${tag}>`;
        }
        case "details":
          return `<p>${b.rows.map((r) => escapeHtml(`${r.label}: ${r.value}`)).join("<br>")}</p>`;
        case "space":
          return "<p></p>";
      }
    })
    .join("");
}

/** Any letter text, new or old, as clean letter HTML. What is posted is always passed through this. */
export function toLetterHtml(raw: string | null | undefined): string {
  return blocksToLetterHtml(letterBlocksOf(raw));
}

/* ---------------------------------------------------------------------------------- as text */

const lineText = (l: Line) => l.map((r) => r.text).join("");

/** The plain words of one block. */
export function blockText(b: RichBlock): string {
  switch (b.kind) {
    case "para":
    case "heading":
      return b.lines.map(lineText).join("\n");
    case "list":
      return b.items.map((it, n) => `${b.ordered ? `${n + 1}.` : BULLET_CHAR} ${it.map(lineText).join("\n")}`).join("\n");
    case "details":
      return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    case "space":
      return "";
  }
}

/** Letter text as plain text: for the record, an email with no formatting, or the AI. */
export function letterPlainText(raw: string | null | undefined): string {
  const blocks = letterBlocksOf(raw);
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "space") out.push("");
    else out.push(blockText(b));
  }
  return out.join("\n\n").replace(/\n{4,}/g, "\n\n\n");
}

/* ------------------------------------------------------------------------- for the PDF */

/**
 * The blocks a PDF draws: a paragraph made only of two or more "Label: value" lines with no
 * formatting becomes the meeting details table, as it always has.
 */
export function pdfBlocks(raw: string | null | undefined): RichBlock[] {
  return letterBlocksOf(raw).map((b) => {
    if (b.kind !== "para" || b.lines.length < 2) return b;
    const plain = b.lines.every((l) => l.every((r) => !r.b && !r.i && !r.u && !r.size));
    const rows = b.lines.map((l) => lineText(l).trim().match(DETAIL_LINE));
    if (!plain || rows.some((r) => !r)) return b;
    return { kind: "details", rows: rows.map((r) => ({ label: r![1], value: r![2] })) };
  });
}

/* ---------------------------------------------------------------------------- for email */

function runEmailHtml(r: Run): string {
  let t = escapeHtml(r.text);
  if (r.u) t = `<u>${t}</u>`;
  if (r.i) t = `<em>${t}</em>`;
  if (r.b) t = `<strong>${t}</strong>`;
  if (r.size === "small") t = `<span style="font-size:12px;">${t}</span>`;
  if (r.size === "large") t = `<span style="font-size:16px;">${t}</span>`;
  return t;
}

const linesEmail = (lines: Line[]) => lines.map((l) => l.map(runEmailHtml).join("")).join("<br />");

/** Letter text as the HTML fragment an email shell expects, styled inline. */
export function letterEmailHtml(raw: string | null | undefined): string {
  const blocks = pdfBlocks(raw);
  return blocks
    .map((b, n) => {
      const gap = n === blocks.length - 1 ? 14 : 10;
      switch (b.kind) {
        case "para":
          return `<p style="margin:0 0 ${gap}px 0;">${linesEmail(b.lines)}</p>`;
        case "heading":
          return `<p style="margin:4px 0 8px 0;font-weight:700;font-size:${b.level === 2 ? 18 : 15}px;">${linesEmail(b.lines)}</p>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag} style="margin:0 0 ${gap}px 20px;padding:0;">${b.items
            .map((it) => `<li style="margin:0 0 4px 0;">${linesEmail(it)}</li>`)
            .join("")}</${tag}>`;
        }
        case "details":
          return `<p style="margin:0 0 ${gap}px 0;">${b.rows
            .map((r) => `<strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}`)
            .join("<br />")}</p>`;
        case "space":
          return `<p style="margin:0;">&nbsp;</p>`;
      }
    })
    .join("");
}

/* ------------------------------------------------------------------------------- merging */

/**
 * Put {{tokens}} into letter HTML. Values are text, escaped, a line break in one kept as a line
 * break. Unknown tokens are left as written, so a typo shows in a preview rather than vanishing
 * from a legal letter. rawHtml values (the outcome letter's middle) go in as letter HTML blocks:
 * a token alone in its paragraph is replaced by them whole.
 */
export function mergeLetterHtml(
  html: string,
  values: Record<string, string>,
  rawHtml: Record<string, string> = {},
): string {
  // A paragraph that is only a token with nothing to say is left out, not printed as a gap (a stage
  // with no action sentence, for example), as the plain text letters always did.
  let out = html.replace(/<p>((?:<[^>]+>)*)\s*\{\{\s*([a-z_]+)\s*\}\}\s*((?:<\/[^>]+>)*)<\/p>/g, (whole, _o, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) && !String(values[token] ?? "").trim() ? "" : whole,
  );
  for (const [token, blockHtml] of Object.entries(rawHtml)) {
    const alone = new RegExp(`<p>(?:<[^>]+>)*\\s*\\{\\{\\s*${token}\\s*\\}\\}\\s*(?:<\\/[^>]+>)*</p>`, "g");
    out = out.replace(alone, blockHtml);
    out = out.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), escapeHtml(letterPlainText(blockHtml)).replace(/\n/g, "<br>"));
  }
  return out.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token)
      ? escapeHtml(values[token] ?? "").replace(/\r?\n/g, "<br>")
      : whole,
  );
}

/** Top level blocks of letter HTML, each as its own letter HTML. */
export function splitLetterHtml(raw: string | null | undefined): string[] {
  return letterBlocksOf(raw).map((b) => blocksToLetterHtml([b]));
}
