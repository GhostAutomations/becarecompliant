import Link from "next/link";
import { formatDisplayDate } from "@/lib/people/logic";
import { dueCountdown } from "@/lib/people/countdown";

/**
 * Be Care Compliant — one box of a cycle, on a Record.
 *
 * ONE COMPONENT, TWO RECORDS (Phil, 2026-09-18: "now what we have done for the layout of the
 * tiles for Supervision and Annual Appraisal, lets do the same for supervisions in the seriver
 * user record"). A person's supervisions and a service user's care plan reviews are the same
 * shape -- numbered slots, each with a due date and a completion, one of them next -- and were
 * two copies of the same markup that had already drifted apart once.
 *
 * THE BOX THAT IS DUE IS THE BUTTON. It goes gold and is itself the link, with a bold day
 * countdown where the pill would be, so what to do next is the loudest thing in the card and
 * there is nothing else to aim at. The others are inert: a slot that is done, or whose turn has
 * not come, is a fact rather than an offer.
 */
export default function CycleBox({
  title,
  due,
  comp,
  ragClass,
  href,
  todayIso,
}: {
  title: string;
  due: string | null;
  comp: string | null;
  /** The rag-cell class for the pill on an inert box. */
  ragClass: string;
  /** Set only on the one that is due next, and only for somebody who may complete it. */
  href: string | null;
  /** Today's London calendar date, for the countdown. */
  todayIso: string;
}) {
  const live = !!href;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[19px] font-semibold ${live ? "text-navy-950" : "text-white/75"}`}>
          {title}
        </span>
        {live ? (
          /* HOW LONG IS LEFT, not that it is next. "Due now" was true of every box in its turn
             and said nothing about urgency. Late is counted the same way and SAID, because a
             countdown on a deadline that has already gone would be the most misleading thing
             on the record. */
          <span className="text-[17px] font-bold text-navy-950">
            {dueCountdown(due, todayIso) ?? "Not scheduled"}
          </span>
        ) : (
          <span className={`rag-cell text-[16px] ${ragClass}`}>
            {comp ? "Done" : due ? formatDisplayDate(due) : "—"}
          </span>
        )}
      </div>
      {/* One weight and one colour throughout: the labels used to be dimmer than their own
          values and both lighter than the title, which put three weights in a box with four
          words in it. */}
      <dl className={`mt-3 space-y-1.5 text-[18px] font-semibold ${live ? "text-navy-950" : "text-white/75"}`}>
        <div className="flex justify-between">
          <dt>Due</dt>
          <dd>{formatDisplayDate(due) || "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Completed</dt>
          <dd>{formatDisplayDate(comp) || "Not yet"}</dd>
        </div>
      </dl>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex flex-col rounded-xl border border-gold-400 bg-gold-400 p-4 shadow-sm transition hover:bg-gold-300"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col rounded-xl border border-white/10 p-4">{body}</div>
  );
}
