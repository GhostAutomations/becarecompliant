/**
 * Be Care Compliant — the words of a memo or message, as blocks (Phil, 2026-10-08: "if i copy
 * something that is formatted with say bullet points, it just goes in as plain text").
 *
 * Pasting from Word, Google Docs or an email is turned into these simple marks in the box (see
 * components/briefings/paste-format.ts), and the same marks can be typed:
 *   # / ## / ###        a heading
 *   - or * or • or ·    a bullet
 *   1. 2. 3. or a)      a numbered point, kept as written
 *   **bold**            bold inside a line
 *   blank line          a new paragraph; a single line break stays a line break
 *
 * Unlike a written policy, NOTHING is guessed: a short line is not turned into a heading, because
 * "Hi all" at the top of a message is not one. Pure and importless, and it never produces HTML,
 * so nothing pasted can inject markup into the reader, the PDF or the email.
 */

export type NoticeInline = { text: string; bold: boolean };

export type NoticeBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: NoticeInline[] }
  | { kind: "para"; lines: NoticeInline[][] }
  | { kind: "bullet"; spans: NoticeInline[] }
  | { kind: "numbered"; marker: string; spans: NoticeInline[] };

export function noticeInlines(raw: string): NoticeInline[] {
  const out: NoticeInline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last), bold: false });
  return out.length > 0 ? out : [{ text: raw, bold: false }];
}

const BULLET = /^\s*(?:[-*•·◦▪●○■]|o(?=\s))\s+(.*)$/;
const NUMBERED = /^\s*((?:\d{1,3}|[a-zA-Z])[.)])\s+(.*)$/;
const HEADING = /^\s*(#{1,3})\s+(.*)$/;

export function parseNoticeText(input: string | null | undefined): NoticeBlock[] {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: NoticeBlock[] = [];
  let para: NoticeInline[][] | null = null;
  const endPara = () => {
    if (para && para.length > 0) out.push({ kind: "para", lines: para });
    para = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      endPara();
      continue;
    }
    let m = HEADING.exec(line);
    if (m && m[2].trim()) {
      endPara();
      out.push({ kind: "heading", level: m[1].length as 1 | 2 | 3, spans: noticeInlines(m[2].trim()) });
      continue;
    }
    m = BULLET.exec(line);
    if (m && m[1].trim()) {
      endPara();
      out.push({ kind: "bullet", spans: noticeInlines(m[1].trim()) });
      continue;
    }
    m = NUMBERED.exec(line);
    if (m && m[2].trim()) {
      endPara();
      out.push({ kind: "numbered", marker: m[1], spans: noticeInlines(m[2].trim()) });
      continue;
    }
    if (!para) para = [];
    para.push(noticeInlines(line.trim()));
  }
  endPara();
  return out;
}

/** The words with the marks taken out, for a plain text email or a search. */
export function noticePlainText(blocks: NoticeBlock[]): string {
  const join = (s: NoticeInline[]) => s.map((x) => x.text).join("");
  return blocks
    .map((b) =>
      b.kind === "para"
        ? b.lines.map(join).join("\n")
        : b.kind === "bullet"
          ? `• ${join(b.spans)}`
          : b.kind === "numbered"
            ? `${b.marker} ${join(b.spans)}`
            : join(b.spans),
    )
    .join("\n\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Escaped HTML for an email body. Every piece of text is escaped; only our own tags are used. */
export function noticeEmailBodyHtml(blocks: NoticeBlock[]): string {
  const spans = (s: NoticeInline[]) =>
    s.map((x) => (x.bold ? `<strong style="color:#ffffff;">${esc(x.text)}</strong>` : esc(x.text))).join("");
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) out.push(`<${list.tag} style="margin:0 0 12px; padding-left:20px;">${list.items.join("")}</${list.tag}>`);
    list = null;
  };
  for (const b of blocks) {
    if (b.kind === "bullet" || b.kind === "numbered") {
      const tag = b.kind === "bullet" ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(`<li style="margin:0 0 4px;">${spans(b.spans)}</li>`);
      continue;
    }
    flush();
    if (b.kind === "heading") {
      out.push(`<p style="margin:0 0 8px; font-weight:700; color:#ffffff;">${spans(b.spans)}</p>`);
    } else {
      out.push(`<p style="margin:0 0 12px;">${b.lines.map(spans).join("<br />")}</p>`);
    }
  }
  flush();
  return out.join("");
}
