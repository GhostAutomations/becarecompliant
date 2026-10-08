/**
 * Be Care Compliant — turn what was copied from Word, Google Docs, Outlook or a web page into the
 * simple marks a memo understands (lib/briefings/notice-text.ts): bullets, numbered points,
 * headings and bold. Runs in the browser on paste. Colours, fonts, tables and images are dropped
 * on purpose: the text stays text, so nothing pasted can carry markup into the app.
 */

function isBold(el: HTMLElement): boolean {
  const tag = el.tagName;
  const weight = (el.style?.fontWeight || "").toLowerCase();
  // Google Docs wraps the whole paste in <b style="font-weight:normal">, which is not bold.
  if (weight === "normal" || weight === "400") return false;
  if (tag === "B" || tag === "STRONG") return true;
  return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
}

function isWordListParagraph(el: HTMLElement): boolean {
  return /MsoList/i.test(el.className || "") || /mso-list/i.test(el.getAttribute("style") || "");
}

/** Text of a node with **bold** marks, on one line. */
function inline(node: Node, bold = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent || "").replace(/\s+/g, " ");
    return bold && t.trim() ? `${/^\s/.test(t) ? " " : ""}**${t.trim()}**${/\s$/.test(t) ? " " : ""}` : t;
  }
  if (!(node instanceof HTMLElement)) return "";
  // Word's own bullet or number, drawn as text: dealt with by the caller.
  if (/mso-list:\s*Ignore/i.test(node.getAttribute("style") || "")) return "";
  if (node.tagName === "BR") return "\n";
  if (["STYLE", "SCRIPT", "TITLE", "META", "XML"].includes(node.tagName)) return "";
  const b = !bold && isBold(node);
  let out = "";
  node.childNodes.forEach((c) => {
    out += inline(c, bold || b);
  });
  return out;
}

const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "TABLE", "TR", "BLOCKQUOTE", "SECTION", "ARTICLE"]);

export function htmlToNoticeText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  const push = (s: string) => lines.push(s.replace(/[ \t]+/g, " ").trim());
  const gap = () => {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  };

  function walk(el: HTMLElement, listDepthTag: "UL" | "OL" | null, counter: { n: number }) {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(3, Number(tag[1]));
      const text = inline(el).replace(/\*\*/g, "").trim();
      if (text) {
        gap();
        push(`${"#".repeat(level)} ${text}`);
        lines.push("");
      }
      return;
    }
    if (tag === "UL" || tag === "OL") {
      const c = { n: Number(el.getAttribute("start") || 1) };
      el.childNodes.forEach((ch) => {
        if (ch instanceof HTMLElement) walk(ch, tag as "UL" | "OL", c);
      });
      lines.push("");
      return;
    }
    if (tag === "LI") {
      const text = inline(el).replace(/\n+/g, " ").trim();
      if (text) push(listDepthTag === "OL" ? `${counter.n++}. ${text}` : `- ${text}`);
      return;
    }
    if (tag === "P" && isWordListParagraph(el)) {
      // Word: the bullet or the number is a span marked mso-list:Ignore.
      const ignore = el.querySelector('[style*="mso-list"]') as HTMLElement | null;
      const mark = (ignore?.textContent || "").replace(/\s+/g, "").trim();
      const text = inline(el).replace(/\n+/g, " ").trim();
      if (text) push(/^(\d{1,3}|[a-zA-Z])[.)]$/.test(mark) ? `${mark} ${text}` : `- ${text}`);
      return;
    }
    const hasBlockChild = Array.from(el.children).some((c) => BLOCK.has(c.tagName));
    if (hasBlockChild) {
      el.childNodes.forEach((ch) => {
        if (ch instanceof HTMLElement && BLOCK.has(ch.tagName)) walk(ch, listDepthTag, counter);
        else {
          const t = inline(ch).trim();
          if (t) {
            gap();
            push(t);
          }
        }
      });
      return;
    }
    const text = inline(el);
    if (text.trim()) {
      gap();
      text.split("\n").forEach((l) => push(l));
      lines.push("");
    }
  }

  walk(doc.body, null, { n: 1 });
  // Word list paragraphs come one after another with no gap; keep them together, collapse the
  // rest of the spacing to single blank lines.
  return lines
    .join("\n")
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text paste: common bullet characters at the start of a line become "- ". */
export function plainToNoticeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/^[ \t]*[•·◦▪●○■][ \t]*/gm, "- ");
}
