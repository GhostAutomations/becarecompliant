/**
 * What a company calls the On Call department.
 *
 * Phil, 2026-09-15: Thistle calls it Out of Hours. Rather than write a company id into the nav,
 * companies.on_call_label holds the name and null means the default (migration 0276).
 *
 * WHY THIS IS ITS OWN PURE MODULE. The label has to reach the sidebar, the department index, four
 * page titles and one dashboard line, and every one of those is somewhere a stale "On Call" can
 * survive a rename and make the product contradict itself. One function decides what the label
 * is, one function applies it to the nav, and both can be tested without a database.
 *
 * IT IS A LABEL, NOTHING ELSE. Routes stay /on-call, the on_call ROLE keeps its own name (somebody
 * is still the person on call whatever the department is called), and no permission, feature gate
 * or table name reads this.
 */

export const DEFAULT_ON_CALL_LABEL = "On Call";

/**
 * The department's name for this company.
 *
 * Anything blank or absent is the default. Whitespace is trimmed rather than trusted: this value
 * is typed by a person, and " " is not a name.
 */
export function onCallLabel(stored: string | null | undefined): string {
  const value = (stored ?? "").trim();
  return value === "" ? DEFAULT_ON_CALL_LABEL : value;
}

type Entry = { href: string; label: string; children?: Entry[] };

/**
 * Rename the On Call entry, and any child that repeats it, wherever it appears in the nav.
 *
 * Keyed on the HREF, not on the current label: matching the text would silently stop working the
 * day somebody edits the default, which is exactly the kind of rename this module exists to
 * survive. Entries are copied rather than edited, because NAV_ENTRIES is a module-level constant
 * shared by every request, and mutating it would rename the department for whoever is served next
 * out of the same process.
 */
export function withOnCallLabel<T extends Entry>(entries: readonly T[], label: string): T[] {
  if (label === DEFAULT_ON_CALL_LABEL) return [...entries];
  return entries.map((e) => {
    const children = e.children ? withOnCallLabel(e.children, label) : undefined;
    const renamed = e.href === "/on-call" ? label : e.label;
    if (renamed === e.label && children === e.children) return e;
    return { ...e, label: renamed, ...(children ? { children } : {}) };
  });
}
