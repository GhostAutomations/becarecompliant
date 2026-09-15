"use client";

import { useRouter } from "next/navigation";

/**
 * Whose calendar: mine, everybody's, or one named colleague.
 *
 * WHY A SELECT AND NOT MORE BUTTONS (Phil, 2026-09-15: "they should be able to select everyones
 * calendar you view, so they just see that calendar"). Mine and All are the two questions
 * everybody asks, so they stay as buttons. Picking one person out of a whole office is a list,
 * and a list of twenty names rendered as buttons is not a control, it is a wall.
 *
 * ONLY THE SENIOR ROLES SEE THE SELECT. The server decides that, not this component: it is simply
 * not rendered for anybody else, and plannerWho refuses the parameter as well, so hiding the
 * control and enforcing the rule are two separate things and neither is load bearing alone.
 *
 * THIS IS A VIEW, NOT A GRANT. It narrows bookings the viewer could already see. Choosing a
 * colleague can never show more than All already showed them.
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
  /** Conductors in this company, for the individual picker. */
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
    // Mine is the default now, so it carries no parameter and the URL stays clean.
    if (next !== "mine") params.set("who", next);
    const qs = params.toString();
    router.push(qs ? `/planner?${qs}` : "/planner");
  }

  const base = "px-3 py-1.5 text-xs";
  const on = "bg-white/15 text-white";
  const off = "text-white/60 hover:bg-white/10";

  return (
    <div className="flex items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-white/15">
        <button type="button" onClick={() => go("mine")} className={`${base} ${who === "mine" ? on : off}`}>
          My calendar
        </button>
        <button type="button" onClick={() => go("all")} className={`${base} ${who === "all" ? on : off}`}>
          All
        </button>
      </div>

      {canViewIndividuals && people.length > 0 ? (
        <select
          aria-label="Show one person's calendar"
          /*
           * inline-cell is the product's existing compact select, the same one the Branch filter
           * on this very calendar uses, so this is not a one-off control.
           *
           * py-1.5 rather than inline-cell's py-1 because the neighbours are buttons at py-1.5
           * inside a 1px border: 12px of padding plus a 16px line box plus the border is 30px,
           * and matching that is what makes the three controls sit on one line.
           *
           * The width is set here rather than left to the content: inline-cell's own 6.5rem
           * floor squashed "Someone else…" into an ellipsis, and letting a long name size it
           * freely would have the toolbar jump about every time the selection changed.
           */
          className="inline-cell py-1.5"
          style={{ minWidth: "10rem", maxWidth: "14rem" }}
          value={who === "mine" || who === "all" ? "" : who}
          onChange={(e) => go(e.target.value === "" ? "mine" : e.target.value)}
        >
          <option value="">Someone else…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
