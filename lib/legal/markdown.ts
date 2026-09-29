/**
 * Reads the contract text (lib/legal/text.ts) into blocks the pages render.
 *
 * Only what the two documents use: "# " title, "## " section, "---" rule, "| a | b |" tables, and
 * paragraphs with **bold** runs. No HTML is ever produced here, so nothing in the text can inject
 * markup; the page renders these blocks as React elements.
 *
 * Pure and importless so node --test runs it.
 */

export type Run = { text: string; bold: boolean };

export type LegalBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string; id: string }
  | { kind: "para"; runs: Run[] }
  | { kind: "rule" }
  | { kind: "table"; header: Run[][] | null; rows: Run[][][] };

/** Split "a **b** c" into runs. An unmatched ** is kept as text. */
export function parseRuns(line: string): Run[] {
  const runs: Run[] = [];
  const parts = line.split("**");
  // An even number of parts means an odd number of markers: the last one has no partner.
  const unmatched = parts.length % 2 === 0;
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    if (unmatched && last) {
      if (runs.length > 0) runs[runs.length - 1].text += `**${p}`;
      else runs.push({ text: `**${p}`, bold: false });
      return;
    }
    if (p === "") return;
    runs.push({ text: p, bold: i % 2 === 1 });
  });
  return runs;
}

/** A stable anchor for a section heading: "16. Length of this agreement" becomes "clause-16". */
export function headingId(text: string): string {
  const num = /^(\d+)\./.exec(text.trim());
  if (num) return `clause-${num[1]}`;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isDivider = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());

export function parseLegalMarkdown(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === "") {
      i++;
      continue;
    }
    if (t === "---") {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (t.startsWith("## ")) {
      const h = t.slice(3).trim();
      blocks.push({ kind: "heading", text: h, id: headingId(h) });
      i++;
      continue;
    }
    if (t.startsWith("# ")) {
      blocks.push({ kind: "title", text: t.slice(2).trim() });
      i++;
      continue;
    }
    if (t.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      let header: Run[][] | null = null;
      let body = tableLines;
      if (tableLines.length >= 2 && isDivider(tableLines[1])) {
        const h = cells(tableLines[0]);
        header = h.every((c) => c === "") ? null : h.map(parseRuns);
        body = tableLines.slice(2);
      }
      blocks.push({ kind: "table", header, rows: body.map((l) => cells(l).map(parseRuns)) });
      continue;
    }
    blocks.push({ kind: "para", runs: parseRuns(t) });
    i++;
  }
  return blocks;
}
