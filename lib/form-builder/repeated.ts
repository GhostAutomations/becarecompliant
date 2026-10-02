/* Isomorphic and import free, so the unit tests can load it directly. */

/**
 * QUESTIONS ASKED TWICE (Phil, 2 Oct 2026: "can there tile be red"). The labels that more than one
 * question uses, compared without case or punctuation. Headings and the "Comments" / "Notes" boxes
 * that sit under questions are meant to repeat, so they never count.
 */
export function repeatedLabels(fields: Array<{ type: string; label: string }>): Set<string> {
  const seen = new Map<string, number>();
  for (const f of fields) {
    const n = normaliseLabel(f.label);
    if (!n || f.type === "heading" || n === "comments" || n === "comment" || n === "notes" || n === "note") continue;
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, c]) => c > 1).map(([n]) => n));
}

export function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
