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

/** The count at the top of a box. "none" is white rather than the faint grey a date gets:
 *  the number is the first thing on the screen, not a detail on a card. */
const COUNT: Record<CardRag, string> = {
  red: "text-rag-red-soft",
  amber: "text-rag-amber-soft",
  green: "text-rag-green-soft",
  none: "text-white",
};

/** How many names a box lists before it says how many more there are. Six fits the box
 *  without making the row of boxes taller than the cards underneath it. */
const BOX_NAMES = 6;

/**
 * One of the four boxes across the top: the count, what it counts, and the names.
 *
 * The names are the point. A count of five overdue supervisions sends a manager to the matrix
 * to find out who; five names sends them to the five records.
 */
function KpiBox({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: DueEntry[];
  tone: CardRag;
}) {
  const shown = entries.slice(0, BOX_NAMES);
  return (
    <div className="glass-card flex flex-col p-4">
      <p className={`text-3xl font-semibold leading-none ${COUNT[tone]}`}>{entries.length}</p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        {title}
      </p>
      {shown.length === 0 ? (
        <p className="mt-3 text-[12px] text-white/35">Nothing due.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-[12px]">
          {shown.map((e) => (
            <li key={`${e.id}-${e.stage}`} className="flex items-baseline justify-between gap-2">
              <Link
                href={`/people/${e.id}?from=%2Fpeople%2Fsummary`}
                className="truncate text-white/70 hover:text-gold-300"
              >
                {e.name}
              </Link>
              <span className="shrink-0 text-white/40">
                {e.stage} · {formatDisplayDate(e.due)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entries.length > shown.length ? (
        <p className="mt-1.5 text-[11px] text-white/35">
          and {entries.length - shown.length} more
        </p>
      ) : null}
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
        <KpiBox title="Supervisions due in 14 days" entries={boxes.fourteen} tone="amber" />
        <KpiBox title="Supervisions due in 30 days" entries={boxes.thirty} tone="none" />
        <KpiBox title="Spot checks due in 30 days" entries={boxes.spot} tone="none" />
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

              {c.chips.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.chips.map((chip) => (
                    <span
                      key={chip.label}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${CHIP[chip.rag]}`}
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
