/**
 * Be Care Compliant — the AI readiness narrative as plain lines, with no markdown symbols left in.
 *
 * DEF-066 (Phil's pack, 2026-09-24): the narrative came out of the model in markdown and the pack
 * printed it as it came, so an inspector would have read "**Provider:** Thistle Care Ltd",
 * "**Well-being (green)**" and a sentence wrapped in single asterisks. The on screen assistant
 * showed the same symbols. The model is now asked for plain text, and whatever it sends is cleaned
 * here as well, because a prompt is a request, not a guarantee.
 *
 * Pure and importless so it can be unit tested.
 */

export type NarrativeLine = { kind: "heading" | "paragraph"; text: string };

/** Take emphasis markers off a line: **bold**, __bold__, *italic*, _italic_, `code`. */
export function stripEmphasis(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])_(?!\s)([^_]+?)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*/g, "")
    .trim();
}

/** The narrative as headings and paragraphs, symbols removed, blank lines dropped. */
export function narrativeLines(text: string): NarrativeLine[] {
  const out: NarrativeLine[] = [];
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t || /^[-*_]{3,}$/.test(t)) continue; // blank lines and horizontal rules
    const heading = /^#{1,6}\s+(.*)$/.exec(t);
    if (heading) {
      out.push({ kind: "heading", text: stripEmphasis(heading[1]) });
      continue;
    }
    // A line that is nothing but bold text is a heading in all but name.
    const boldOnly = /^\*\*([^*]+)\*\*:?$/.exec(t);
    if (boldOnly) {
      out.push({ kind: "heading", text: stripEmphasis(boldOnly[1]) });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    out.push({ kind: "paragraph", text: bullet ? `•  ${stripEmphasis(bullet[1])}` : stripEmphasis(t) });
  }
  return out;
}

/** The same, as one block of plain text for the on screen assistant. */
export function narrativePlainText(text: string): string {
  return narrativeLines(text)
    .map((l) => l.text)
    .join("\n\n");
}
