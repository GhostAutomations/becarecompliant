/**
 * Be Care Compliant -- one person's compliance, as a card.
 *
 * WHY (Phil, 2026-09-09, of the Compliance Summary): "we just have three boxes. i want this
 * so all people can be seen in one spot." Three counts told a manager how many people were
 * overdue and not one of their names, so the next move was always the same: go to the matrix
 * and read across two hundred rows. This is the board Thistle actually runs its week from,
 * where every carer is a card and the whole team is one screen.
 *
 * The card is built HERE, not in the component, because what counts as due, done or missing
 * is a compliance judgement and belongs somewhere it can be tested. The component draws it.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

export type CardRag = "red" | "amber" | "green" | "none";

/** One dated line on a card: Spot Check, Manual Handling, RTW expiry. */
export type CardLine = {
  label: string;
  /** ISO date, or null when there is nothing scheduled. */
  due: string | null;
  rag: CardRag;
  /** True when this is done and has nothing outstanding, e.g. probation passed. */
  done?: boolean;
};

/** One stage chip: PE, S1, S2, S3, AA. */
export type CardChip = { label: string; rag: CardRag };

export type PersonCard = {
  id: string;
  name: string;
  /** Job title and branch, as one line under the name. */
  subtitle: string;
  chips: CardChip[];
  lines: CardLine[];
  /** The next thing this person owes, for the badge: "SUP 2" and its date. */
  nextLabel: string | null;
  nextDue: string | null;
  nextRag: CardRag;
  /** How many dated lines are in date, out of how many are scheduled at all. */
  inDate: number;
  scheduled: number;
  /** The worst RAG anywhere on the card, for filtering and sorting. */
  worst: CardRag;
};

const RANK: Record<CardRag, number> = { red: 0, amber: 1, green: 2, none: 3 };

/** The worse of two RAGs. */
export function worseRag(a: CardRag, b: CardRag): CardRag {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Days from today to an ISO date. Negative when it has passed. */
export function daysUntil(iso: string | null | undefined, todayIso: string): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const a = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const b = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  return Math.round((a - b) / 86400000);
}

/** Red once it is past, amber inside the amber window, green beyond it. */
export function ragFor(
  due: string | null | undefined,
  todayIso: string,
  amberDays: number,
): CardRag {
  const days = daysUntil(due, todayIso);
  if (days === null) return "none";
  if (days < 0) return "red";
  return days <= amberDays ? "amber" : "green";
}

/** Does this card fall inside a "due in N days" filter? Overdue always counts: something
 *  that was due last month is more urgent than something due next week, not less. */
export function dueWithin(card: PersonCard, days: number, todayIso: string): boolean {
  return card.lines.some((l) => {
    const d = daysUntil(l.due, todayIso);
    return d !== null && d <= days;
  });
}

/** Name match for the search box, forgiving of case and stray spaces. */
export function matchesSearch(card: PersonCard, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return `${card.name} ${card.subtitle}`.toLowerCase().includes(t);
}

/** Cards worst first, then soonest due, then by name, so the people who need doing are at
 *  the top of the screen rather than wherever the alphabet put them. */
export function sortCards(cards: PersonCard[]): PersonCard[] {
  return [...cards].sort(
    (a, b) =>
      RANK[a.worst] - RANK[b.worst] ||
      (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999") ||
      a.name.localeCompare(b.name),
  );
}
