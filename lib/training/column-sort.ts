/**
 * Sorting the Training register by a column, not just by name (Phil, popup 2026-10-05: "so we can
 * see if there's a training course coming up, click that training course, sort it, and put it in
 * date order").
 *
 * WHAT "SOONEST DUE FIRST" MEANS for one course, top to bottom:
 *   1. Never done (no record): the most urgent thing on the course, red on the register.
 *   2. A renewal date, oldest first: expired dates come before today, today before tomorrow.
 *   3. Done with no renewal date (a one off course, or a record still missing its date).
 *   4. The course does not apply to this person (the dash). Always last, in BOTH directions,
 *      because sorting a dash to the top of "Latest first" would bury the answer under people
 *      the course has nothing to do with.
 * "Latest first" is the same list reversed, except the dashes stay at the bottom.
 *
 * Ties keep the order they arrived in, which is the Carer name order the person chose, so a
 * column sort never scrambles names that share a date.
 *
 * NO RUNTIME IMPORTS, so node --test can load it directly.
 */

export type ColumnSortDir = "soonest" | "latest";
export type ColumnSort = { key: string; dir: ColumnSortDir } | null;

/** The pieces of a register cell the order needs. Missing cell = the course does not apply. */
export type SortableCell = { status: string; expiryOn?: string | null } | null | undefined;

/** Rank buckets: lower sorts first under "soonest". */
const NEVER_DONE = 0;
const DATED = 1;
const UNDATED = 2;

function rank(cell: SortableCell): { bucket: number; date: string } | null {
  if (!cell) return null; // not applicable
  if (cell.status === "missing") return { bucket: NEVER_DONE, date: "" };
  if (cell.expiryOn) return { bucket: DATED, date: cell.expiryOn };
  return { bucket: UNDATED, date: "" };
}

function compareRanks(a: { bucket: number; date: string }, b: { bucket: number; date: string }): number {
  if (a.bucket !== b.bucket) return a.bucket - b.bucket;
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** Order rows by one course. Stable, never mutates the list it is given. */
export function sortByCourse<T>(
  rows: readonly T[],
  cellOf: (row: T) => SortableCell,
  dir: ColumnSortDir,
): T[] {
  const indexed = rows.map((row, i) => ({ row, i, r: rank(cellOf(row)) }));
  indexed.sort((x, y) => {
    if (!x.r || !y.r) {
      if (!x.r && !y.r) return x.i - y.i;
      return x.r ? -1 : 1; // not applicable last, either direction
    }
    const c = compareRanks(x.r, y.r);
    if (c !== 0) return dir === "soonest" ? c : -c;
    return x.i - y.i;
  });
  return indexed.map((x) => x.row);
}

/**
 * Order rows by a number (a phase bar's percentage, lowest first under "soonest" because the
 * least complete is the one to chase). Null (no courses in that phase for them) sorts last.
 */
export function sortByNumber<T>(
  rows: readonly T[],
  valueOf: (row: T) => number | null | undefined,
  dir: ColumnSortDir,
): T[] {
  const indexed = rows.map((row, i) => ({ row, i, v: valueOf(row) }));
  indexed.sort((x, y) => {
    const xn = x.v == null, yn = y.v == null;
    if (xn || yn) return xn && yn ? x.i - y.i : xn ? 1 : -1;
    const c = (x.v as number) - (y.v as number);
    if (c !== 0) return dir === "soonest" ? c : -c;
    return x.i - y.i;
  });
  return indexed.map((x) => x.row);
}

/**
 * Order rows by a date where a missing value is the most urgent (the Social Care Wales column:
 * no number recorded comes first, then the renewal date soonest first). `applies` false keeps a
 * row at the bottom (somebody not yet required to register).
 */
export function sortByDate<T>(
  rows: readonly T[],
  dateOf: (row: T) => string | null | undefined,
  dir: ColumnSortDir,
  missingFirst: (row: T) => boolean,
): T[] {
  return sortByCourse(
    rows,
    (row) => {
      const d = dateOf(row);
      if (d) return { status: "valid", expiryOn: d };
      return missingFirst(row) ? { status: "missing" } : { status: "valid", expiryOn: null };
    },
    dir,
  );
}
