/**
 * Be Care Compliant: rota dropdowns in alphabetical order (Phil, 2026-10-16: "all the drop-down
 * options need to be in alphabetical order"; docs/decisions/rota-visits.md, Stage 5 decision 13).
 * A to Z by the words shown, "Other" always last. Importless, so node --test runs it.
 */

const collator = new Intl.Collator("en-GB", { sensitivity: "base", numeric: true });

export function azOtherLast<T>(list: readonly T[], label: (x: T) => string): T[] {
  const isOther = (x: T) => label(x).trim().toLowerCase() === "other";
  return [...list].sort((a, b) => Number(isOther(a)) - Number(isOther(b)) || collator.compare(label(a), label(b)));
}
