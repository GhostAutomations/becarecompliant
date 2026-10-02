/**
 * Does a controlling answer satisfy a visibleWhen list? Importless, so it is unit tested.
 *
 * CASE DOES NOT MATTER (DEF-104, 2 Oct 2026). A yes_no question stores "Yes" or "No", and forms
 * written by hand say in: ["yes"] or ["no"]: the Incident Report's follow up questions (why no
 * treatment, why the next of kin was not told, what was unusual) never appeared and were never
 * required. Comparing without case makes every such form work as written.
 */
export function matchesVisibleWhen(inList: readonly unknown[], controlling: unknown): boolean {
  if (controlling == null) return false;
  const wanted = inList.map((w) => String(w).toLowerCase());
  if (Array.isArray(controlling)) return controlling.some((v) => wanted.includes(String(v).toLowerCase()));
  return wanted.includes(String(controlling).toLowerCase());
}
