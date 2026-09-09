"use client";

/**
 * Be Care Compliant -- the whole team's compliance, one card each.
 *
 * Phil, 2026-09-09: "we just have three boxes. i want this so all people can be seen in one
 * spot." The three counts said how many were overdue and never who, so the next move was
 * always to go and read the matrix. Every person is a card here, worst first.
 *
 * Search and the due filters run on the CLIENT over rows already loaded, so switching between
 * All, 14 days and 30 days is instant and costs no round trip -- the same choice the People
 * register makes for its views.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  dueWithin,
  lineDueWithin,
  matchesSearch,
  overdueSupervisions,
  sortCards,
  supervisionsDueWithin,
  type CardRag,
  type DueEntry,
  type PersonCard,
} from "@/lib/people/summary-card";
import { formatDisplayDate } from "@/lib/people/logic";

const CHIP: Record<CardRag, string> = {
  red: "bg-rag-red/20 text-rag-red-soft",
  amber: "bg-rag-amber/20 text-rag-amber-soft",
  green: "bg-rag-green/20 text-rag-green-soft",
  none: "bg-white/10 text-white/45",
};

const DATE: Record<CardRag, string> = {
  red: "text-rag-red-soft",
  amber: "text-rag-amber-soft",
  green: "text-rag-green-soft",
  none: "text-white/40",
};

/** The count at the top of a box, in the colour of the thing it counts: red for what has been
 *  missed, gold for the fortnight, blue for the month ahead. */
const COUNT: Record<string, string> = {
  red: "text-rag-red",
  gold: "text-gold-300",
  blue: "text-sky-400",
};

/**
 * One of the boxes across the top: the count, what it counts, and the names under it.
 *
 * The names are the point. A count of five overdue supervisions sends a manager to the matrix
 * to find out who; five names sends them to the five records.
 *
 * Every box is the same height whatever it holds, so the row stays a row; a list longer than
 * the box scrolls inside it rather than pushing the board down the screen.
 */
function KpiBox({
  title,
  entries,
  tone,
  showStage = true,
}: {
  title: string;
  entries: DueEntry[];
  /** The colour of the count, or null for a box that shows no count -- the spot check box on
   *  Phil's own board is a list under a heading, not a number. */
  tone: keyof typeof COUNT | null;
  showStage?: boolean;
}) {
  const row = showStage
    ? "grid grid-cols-[minmax(0,1fr)_3.25rem_auto] items-baseline gap-2"
    : "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2";
  return (
    <div className="glass-card flex h-56 flex-col p-4">
      {tone ? (
        <>
          <p className={`text-[28px] font-semibold leading-none ${COUNT[tone]}`}>
            {entries.length}
          </p>
          <p className="mt-2 text-[13px] text-white/55">{title}</p>
        </>
      ) : (
        <p className="text-[13px] text-white/55">{title}</p>
      )}
      {entries.length === 0 ? (
        <p className="mt-3 text-[12px] text-white/35">Nothing due.</p>
      ) : (
        <ul className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1 text-[12px]">
          {entries.map((e) => (
            <li key={`${e.id}-${e.stage}`} className={row}>
              <Link
                href={`/people/${e.id}?from=%2Fpeople%2Fsummary`}
                className="truncate text-white/70 hover:text-gold-300"
              >
                {e.name}
              </Link>
              {showStage ? <span className="text-white/40">{e.stage}</span> : null}
              <span className="whitespace-nowrap text-right text-white/40">
                {formatDisplayDate(e.due)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WINDOWS = [
  { key: "all", label: "All", days: null },
  { key: "14", label: "14 days", days: 14 },
  { key: "30", label: "30 days", days: 30 },
] as const;

export default function ComplianceCards({
  cards,
  today,
}: {
  cards: PersonCard[];
  /** Today in London, worked out on the server so every card agrees with the register. */
  today: string;
}) {
  const [term, setTerm] = useState("");
  const [window, setWindow] = useState<string>("all");

  /* The boxes count the WHOLE board -- the branch already chosen on the server -- not what
     the search box has narrowed it to. They are the week's workload; typing a name to find
     one person should not make the workload appear to shrink. */
  const boxes = useMemo(
    () => ({
      overdue: overdueSupervisions(cards, today),
      fourteen: supervisionsDueWithin(cards, 14, today),
      thirty: supervisionsDueWithin(cards, 30, today),
      spot: lineDueWithin(cards, "Spot Check", 30, today),
    }),
    [cards, today],
  );

  const shown = useMemo(() => {
    const days = WINDOWS.find((w) => w.key === window)?.days ?? null;
    return sortCards(
      cards.filter(
        (c) => matchesSearch(c, term) && (days === null || dueWithin(c, days, today)),
      ),
    );
  }, [cards, term, window, today]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <KpiBox title="Overdue supervisions" entries={boxes.overdue} tone="red" />
        <KpiBox title="Supervisions due in 14 days" entries={boxes.fourteen} tone="gold" />
        <KpiBox title="Supervisions due in 30 days" entries={boxes.thirty} tone="blue" />
        <KpiBox
          title="Spot checks due in 30 days"
          entries={boxes.spot}
          tone={null}
          showStage={false}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name, job title or branch"
          className="w-full max-w-sm text-sm"
          aria-label="Search people"
        />
        <div className="flex items-center gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWindow(w.key)}
              className={
                window === w.key
                  ? "rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white"
                  : "rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/50 hover:bg-white/5 hover:text-white/80"
              }
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/40">
        {shown.length} of {cards.length} {cards.length === 1 ? "person" : "people"}
        {window === "all" ? "" : ", due or overdue in the window"}. Worst first.
      </p>

      {shown.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          Nobody matches that. Clear the search or widen the window.
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          {shown.map((c) => (
            <div key={c.id} className="glass-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/people/${c.id}?from=%2Fpeople%2Fsummary`}
                    className="text-[15px] font-semibold text-white hover:text-gold-300"
                  >
                    {c.name}
                  </Link>
                  <p className="truncate text-[12px] text-white/45">{c.subtitle}</p>
                </div>
                {c.nextLabel ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${CHIP[c.nextRag]}`}
                  >
                    {c.nextLabel}
                    {c.nextDue ? `: ${formatDisplayDate(c.nextDue)}` : ""}
                  </span>
                ) : null}
              </div>

              {/* One equal column per stage, filling the card edge to edge (Phil, 2026-09-09:
                  "make the little PE S1 S2 S3 AA squares the width of the tile"). Wrapping
                  left a ragged gap on the right and made the stages look like loose tags
                  rather than the run of a year. */}
              {c.chips.length > 0 ? (
                <div
                  className="mt-3 grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${c.chips.length}, minmax(0, 1fr))` }}
                >
                  {c.chips.map((chip) => (
                    <span
                      key={chip.label}
                      className={`rounded-md py-1 text-center text-[11px] font-semibold ${CHIP[chip.rag]}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                Next due dates
              </p>
              <dl className="mt-1.5 space-y-1 text-[13px]">
                {c.lines.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-white/55">{l.label}</dt>
                    <dd className={`shrink-0 font-medium ${DATE[l.rag]}`}>
                      {l.done ? "Complete" : l.due ? formatDisplayDate(l.due) : "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 border-t border-white/10 pt-2 text-[11px] text-white/40">
                {c.inDate}/{c.scheduled} in date
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
