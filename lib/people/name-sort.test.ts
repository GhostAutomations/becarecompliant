import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. name-sort.ts has no runtime imports for exactly this reason. */
import { surnameSortKey, bySurname, givenNameSortKey, byGivenName } from "./name-sort.ts";

test("THE COMPLAINT: a carer files under their surname, not their first name", () => {
  assert.equal(surnameSortKey("Bethan Hughes"), "hughes bethan");
});

test("middle names belong with the given names, not the surname", () => {
  // Real carers on the test company.
  assert.equal(surnameSortKey("Taiye Emmanuella Aladesuyi"), "aladesuyi taiye emmanuella");
  assert.equal(surnameSortKey("Chamara Nishantha Palliyaguru"), "palliyaguru chamara nishantha");
});

test("hyphenated and apostrophe surnames stay whole", () => {
  assert.equal(surnameSortKey("Damilola Quadri-Eleruja"), "quadri-eleruja damilola");
  assert.equal(surnameSortKey("Mary Ikpi-Ubi"), "ikpi-ubi mary");
  assert.equal(surnameSortKey("Siobhan O'Brien"), "o'brien siobhan");
});

test("PARTICLES BELONG TO THE SURNAME: van der Berg files under V, not B", () => {
  assert.equal(surnameSortKey("Anna van der Berg"), "van der berg anna");
  assert.equal(surnameSortKey("Miguel de la Cruz"), "de la cruz miguel");
  assert.equal(surnameSortKey("Maria dos Santos"), "dos santos maria");
  assert.equal(surnameSortKey("Ahmed bin Rashid"), "bin rashid ahmed");
});

test("mac, mc and o are NOT treated as particles", () => {
  // They are nearly always joined. Treating them as particles would swallow the given name of
  // a "Mac Smith" and file him under Mac.
  assert.equal(surnameSortKey("Mac Smith"), "smith mac");
  assert.equal(surnameSortKey("Ewan MacDonald"), "macdonald ewan");
});

test("a name that is ALL particles keeps a surname rather than becoming unsortable", () => {
  assert.equal(surnameSortKey("de Souza"), "souza de");
  assert.equal(surnameSortKey("Van Damme"), "damme van");
});

test("one word, no words, and rubbish all produce something sortable", () => {
  assert.equal(surnameSortKey("Cher"), "cher");
  assert.equal(surnameSortKey("   Prince   "), "prince");
  // A nameless record sorts FIRST, so somebody notices it, rather than hiding at the bottom.
  assert.equal(surnameSortKey(""), "");
  assert.equal(surnameSortKey("   "), "");
  assert.equal(surnameSortKey(null), "");
  assert.equal(surnameSortKey(undefined), "");
});

test("extra whitespace does not change where somebody files", () => {
  assert.equal(surnameSortKey("  Bethan   Hughes "), "hughes bethan");
});

test("the register order is surname first, and stable", () => {
  const names = [
    { full_name: "Bethan Hughes" },
    { full_name: "Aled Price" },
    { full_name: "Anna van der Berg" },
    { full_name: "Zara Ahmed" },
  ];
  assert.deepEqual(
    bySurname(names, (p) => p.full_name).map((p) => p.full_name),
    ["Zara Ahmed", "Bethan Hughes", "Aled Price", "Anna van der Berg"],
  );
});

/* FIRST NAME ORDER, the other half of the register's Carer menu (Phil, 2026-09-16).
   It is the name as written, which is how the names read on screen. */
test("first name order files a person under the name they are written by", () => {
  assert.equal(givenNameSortKey("Bethan Hughes"), "bethan hughes");
  // Surname order files the same person under H; the two must genuinely differ.
  assert.equal(surnameSortKey("Bethan Hughes"), "hughes bethan");
});

test("first name order tidies spacing and case without reordering anything", () => {
  assert.equal(givenNameSortKey("  Taiye   Emmanuella  Aladesuyi "), "taiye emmanuella aladesuyi");
  assert.equal(givenNameSortKey(null), "");
  assert.equal(givenNameSortKey(undefined), "");
});

test("the two orders sort a real branch differently", () => {
  const names = ["Vera Asanimor", "Chloe Driscoll", "Asim Riaz", "Mary Ikpi-Ubi"];
  assert.deepEqual(byGivenName(names, (n) => n), [
    "Asim Riaz",
    "Chloe Driscoll",
    "Mary Ikpi-Ubi",
    "Vera Asanimor",
  ]);
  assert.deepEqual(bySurname(names, (n) => n), [
    "Vera Asanimor",
    "Chloe Driscoll",
    "Mary Ikpi-Ubi",
    "Asim Riaz",
  ]);
});

test("neither order mutates the list it is given", () => {
  const names = ["Vera Asanimor", "Chloe Driscoll"];
  byGivenName(names, (n) => n);
  bySurname(names, (n) => n);
  assert.deepEqual(names, ["Vera Asanimor", "Chloe Driscoll"]);
});

