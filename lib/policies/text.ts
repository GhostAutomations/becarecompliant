/**
 * Be Care Compliant — a written or pasted policy, turned into blocks.
 *
 * Phil, 2026-07-26: "what about if people want to copy and paste their policy".
 * Most care policies live in Word, and asking a registered manager to export a
 * PDF before they can issue anything is a tax on the busiest person in the
 * building. So they can paste it, and this makes sense of what they pasted.
 *
 * Deliberately TINY and dependency free, and it never produces HTML: it returns
 * a block list that React renders as real elements and @react-pdf draws as real
 * text. Nothing pasted can therefore inject markup, script or styling, which is
 * the whole reason not to reach for a rich text editor here.
 *
 * What it understands (chosen because it is what pasted policies actually
 * contain, not because it is a Markdown implementation):
 *   # / ## / ###   a heading
 *   - or * or •    a bullet
 *   1. 2. 3.       a numbered point (kept as written: clause numbers matter)
 *   **bold**       bold inside a line
 *   blank line     a new paragraph
 * A line in Title Case with no full stop, sitting alone, is treated as a heading
 * too, because that is how a Word policy marks its sections.
 */

export type Inline = { text: string; bold: boolean };

export type PolicyBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: Inline[] }
  | { kind: "para"; spans: Inline[] }
  | { kind: "bullet"; spans: Inline[] }
  | { kind: "numbered"; marker: string; spans: Inline[] };

/** Split **bold** runs out of one line. Anything unmatched stays literal text. */
function inlines(raw: string): Inline[] {
  const out: Inline[] = [];
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

/**
 * Is this line a section heading rather than a sentence?
 *
 * Fixed 2026-07-27 after Phil pasted a real policy: "1. Purpose" was treated as a
 * heading but "2. Who it applies to" was not, because the old test wanted half
 * the words capitalised. Care policies head their sections in SENTENCE case all
 * the time ("Who it applies to", "If something goes wrong"), so the real signals
 * are length and the absence of sentence punctuation, not capital letters.
 */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 60) return false;
  // A heading does not end in sentence punctuation, and never contains a full
  // stop mid-line (that is two sentences, i.e. prose).
  if (/[.:;,!?]$/.test(t)) return false;
  if (/\.\s/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 9) return false;
  // It has to start like a heading: a capital or a clause number.
  return /^[A-Z0-9]/.test(t);
}

export function parsePolicyText(input: string): PolicyBlock[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PolicyBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    blocks.push({ kind: "para", spans: inlines(text) });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flush();
      continue;
    }

    const hash = /^(#{1,3})\s+(.*)$/.exec(line);
    if (hash) {
      flush();
      blocks.push({
        kind: "heading",
        level: hash[1].length as 1 | 2 | 3,
        spans: inlines(hash[2].trim()),
      });
      continue;
    }

    const bullet = /^[-*\u2022]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", spans: inlines(bullet[1].trim()) });
      continue;
    }

    const numbered = /^(\d+[.)]|\d+\.\d+)\s+(.*)$/.exec(line);
    if (numbered) {
      flush();
      const rest = numbered[2].trim();
      // "4. Safeguarding" is a heading; "4. Report it the same day." is a point.
      if (looksLikeHeading(rest)) {
        blocks.push({
          kind: "heading",
          level: 2,
          spans: inlines(`${numbered[1]} ${rest}`),
        });
      } else {
        blocks.push({ kind: "numbered", marker: numbered[1], spans: inlines(rest) });
      }
      continue;
    }

    // A lone short Title Case line between blanks is how Word policies head a
    // section, so treat it as one rather than burying it in a paragraph.
    if (paragraph.length === 0 && looksLikeHeading(line)) {
      blocks.push({ kind: "heading", level: 2, spans: inlines(line) });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Plain text of a block list, for previews and search. */
export function policyPlainText(blocks: PolicyBlock[]): string {
  return blocks
    .map((b) => b.spans.map((s) => s.text).join(""))
    .join("\n")
    .trim();
}

/** Roughly how long it takes to read, so a reader can be told up front. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
