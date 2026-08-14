/**
 * Be Care Compliant — filing a person under their SURNAME.
 *
 * PURE, WITH NO RUNTIME IMPORTS, so the rule is unit testable and matches the SQL function of
 * the same name (migration 0184) that the database sorts by. Two implementations of one rule
 * is a liability, so if you change one, change the other and the tests will tell you.
 *
 * WHY. A person has ONE `full_name` column, and every register ordered by it, so "Bethan
 * Hughes" filed under B. A manager scanning forty carers is looking for Hughes. Phil, from the
 * Training review: "the register sorts on first name".
 *
 * The hard part is not splitting on a space, it is the names that do not split on a space.
 * Dutch, Portuguese, Spanish and Arabic surnames carry particles that belong WITH the surname
 * ("van der Berg" files under V, not B), and this product serves an overwhelmingly
 * international workforce — the test company alone has Palliyaguru, Quadri-Eleruja, Ikpi-Ubi,
 * Aladesuyi and Jepkosgei. Getting this wrong misfiles real people.
 */

/** Particles that belong to the surname when they appear as separate words.
 *
 *  Deliberately EXCLUDES mac, mc and o. Those are nearly always joined to the name
 *  ("MacDonald", "O'Brien"), so treating them as particles would wrongly swallow the given
 *  name of a "Mac Smith" and file him under Mac. */
const PARTICLES = new Set([
  "van", "von", "der", "den", "ter", "ten", "te",
  "de", "del", "della", "di", "da", "das", "do", "dos", "du",
  "la", "le", "les", "lo",
  "bin", "binti", "binte", "ibn", "abu", "al", "el",
  "saint", "st",
]);

/**
 * A key to sort by, NOT something to display: "Bethan Hughes" becomes "hughes bethan".
 *
 * A blank or nameless record returns "", so it sorts FIRST rather than being tucked away at
 * the bottom. A person with no name is a data problem somebody should see.
 */
export function surnameSortKey(fullName: unknown): string {
  const words = String(fullName ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0];

  // Walk left from the last word for as long as the word before it is a particle.
  let start = words.length - 1;
  while (start > 0 && PARTICLES.has(words[start - 1])) start -= 1;
  // Never swallow the whole name: somebody called "de Souza" keeps a given name of nothing
  // rather than becoming un-sortable, and "Van Damme" files under V with no first name lost.
  if (start === 0) start = words.length - 1;

  const surname = words.slice(start).join(" ");
  const given = words.slice(0, start).join(" ");
  return given ? `${surname} ${given}` : surname;
}

/** Sort a list of records by surname, then by whatever is left of the name. */
export function bySurname<T>(items: readonly T[], nameOf: (item: T) => unknown): T[] {
  return [...items].sort((a, b) =>
    surnameSortKey(nameOf(a)).localeCompare(surnameSortKey(nameOf(b)), "en-GB"),
  );
}
