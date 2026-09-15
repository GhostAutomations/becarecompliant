"use client";

import { useRouter } from "next/navigation";

/**
 * Whose calendar: mine, everyone's, or one named colleague.
 *
 * ONE CONTROL, NOT TWO (Phil, 2026-09-15: "remove my calendar and all, add it to the drop down").
 * This started as two buttons plus a select. Three questions of the same kind, asked by two
 * different-looking controls, is what made the toolbar read as clutter: the buttons and the
 * select were never alternatives to each other, they were all just "whose calendar".
 *
 * A select also tells the truth about the state. With buttons plus a select, choosing a colleague
 * left both buttons unlit and the answer to "whose am I looking at" was only in the dropdown.
 * Now the closed control always names the current calendar.
 *
 * SOMEBODY WITHOUT THE INDIVIDUAL VIEW STILL GETS THIS CONTROL, with two options rather than a
 * different-shaped one. A Manager and an Admin should not be looking at differently built
 * toolbars for the same question.
 *
 * THIS IS A VIEW, NOT A GRANT. It narrows bookings the viewer can already see, so choosing a
 * colleague can never show more than Everyone already showed them.
 */

export type WhoOption = { id: string; name: string };

export default function PlannerWhoPicker({
  who,
  people,
  canViewIndividuals,
  month,
  week,
}: {
  /** "mine", "all", or a profile id. */
  who: string;
  /** Conductors in this company, for the individual options. */
  people: WhoOption[];
  canViewIndividuals: boolean;
  month?: string;
  week?: string;
}) {
  const router = useRouter();

  function go(next: string) {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (week) params.set("week", week);
    // Mine is the default, so it carries no parameter and the URL stays clean.
    if (next !== "mine") params.set("who", next);
    const qs = params.toString();
    router.push(qs ? `/planner?${qs}` : "/planner");
  }

  const showPeople = canViewIndividuals && people.length > 0;

  return (
    <select
      aria-label="Whose calendar to show"
      /*
       * inline-cell is the product's existing compact select, the same one the Branch filter on
       * this calendar uses. py-1.5 rather than its own py-1 so it stands exactly as tall as the
       * Month / Week buttons beside it. The width is fixed rather than sized to the content, or
       * the toolbar shifts every time the selection changes.
       */
      className="inline-cell py-1.5"
      style={{ minWidth: "11rem", maxWidth: "14rem" }}
      value={who}
      onChange={(e) => go(e.target.value)}
    >
      <option value="mine">My calendar</option>
      <option value="all">Everyone</option>
      {showPeople ? (
        <optgroup label="Someone else">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
