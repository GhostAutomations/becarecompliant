"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { saveTrainingBulk } from "@/lib/training/actions";
import CourseMultiSelect from "@/components/training/course-multi-select";
import { deriveRenewalDate } from "@/lib/training/renewal";
import type { TrainingCourse } from "@/lib/training/data";

type PersonLite = { id: string; full_name: string; branch_name: string };

/**
 * Record one course for a whole team on one date.
 *
 * WHY (Phil, 2026-08-01). A care team does Moving and Handling together on a Tuesday morning.
 * Before this, recording it was one dialog per carer, twenty times over, each with two dates
 * typed by hand.
 *
 * SEVERAL COURSES AT ONCE (Phil, 2026-08-01), because an induction day covers half a dozen in
 * one sitting. Each keeps its own renewal date, listed before you press anything, since a 12
 * month course and a 36 month one done the same morning do not fall due together.
 *
 * The renewal dates are shown but never typed: they follow the course. The server works them out
 * again from the same function, so what is stored does not depend on the browser.
 *
 * IT ALSO BOOKS (Phil, 2026-08-14). A team is booked onto a course together far more often than
 * it is recorded together, because the booking is made when the trainer is arranged, weeks
 * before anybody turns up. Same list of carers, same list of courses, one toggle, and the
 * screen says out loud which of the two it is about to do: replacing a training record and
 * arranging a date are not things anybody should do by accident.
 */
export default function BulkTrainingDialog({
  courses,
  people,
  onClose,
}: {
  courses: TrainingCourse[];
  people: PersonLite[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [chosenCourses, setChosenCourses] = useState<Set<string>>(new Set());
  /** "record" writes completions. "book" writes a date and touches nothing else. */
  const [mode, setMode] = useState<"record" | "book">("record");
  const booking = mode === "book";
  const [completed, setCompleted] = useState("");
  const [bookedFor, setBookedFor] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /**
   * What each chosen course renews on. Shown per course rather than as one date, because a 12
   * month course and a 36 month one done on the same morning do not fall due together.
   */
  const renewals = courses
    .filter((c) => chosenCourses.has(c.id))
    .map((c) => ({
      name: c.name,
      // oneOff is carried SEPARATELY from the date. Deriving "one off" from a null renewal date
      // told a manager that a 24 month course was a one off whenever the completion box was still
      // empty, which is the opposite of true and exactly the sort of thing she would believe.
      oneOff: c.renewal_months == null,
      months: c.renewal_months,
      on: completed ? deriveRenewalDate(completed, c.renewal_months) : null,
    }));

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? people : people.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [people, query]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allListedPicked = listed.length > 0 && listed.every((p) => picked.has(p.id));
  const toggleAllListed = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      // Only the people currently listed, so a search followed by "select all" cannot quietly
      // tick somebody who is not on screen.
      if (allListedPicked) listed.forEach((p) => next.delete(p.id));
      else listed.forEach((p) => next.add(p.id));
      return next;
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">
          {booking ? "Book training" : "Record training"}
        </h2>
        <p className="mt-1 text-sm text-white/55">
          {booking
            ? "One date, everyone who is going, and as many courses as the session covers. Nothing already recorded is changed, and nobody becomes compliant by being booked."
            : "One date, everyone who attended, and as many courses as the session covered. Anything already recorded for these carers on these courses is replaced."}
        </p>

        {/* TWO BUTTONS, NOT A CHECKBOX. The difference between recording and booking is the
            difference between "this happened" and "this is arranged", and one of them replaces
            a compliance record. A tick box on the far side of a long form is not enough
            warning. */}
        <div className="mt-4 flex gap-2">
          {(["record", "book"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`${mode === m ? "btn-primary" : "btn-outline"} px-3 py-1.5 text-xs`}
            >
              {m === "record" ? "They have done it" : "They are booked on it"}
            </button>
          ))}
        </div>

        <ActionForm
          key={mode}
          action={saveTrainingBulk}
          hidden={{ intent: mode }}
          label={booking ? "Book training" : "Record training"}
          savingLabel={booking ? "Booking…" : "Recording…"}
          savedLabel={booking ? "Booked" : "Recorded"}
          buttonClassName="btn-primary px-4 py-2 text-sm"
          className="mt-5 flex min-h-0 flex-1 flex-col gap-4"
          onDone={() => {
            onClose();
            router.refresh();
          }}
        >
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[16rem] flex-1">
              <span className="form-label">Courses</span>
              <CourseMultiSelect
                courses={courses}
                selected={chosenCourses}
                onChange={setChosenCourses}
              />
            </div>
            <div>
              <label htmlFor={booking ? "bulk_booked" : "bulk_completed"} className="form-label">
                {booking ? "Booked for" : "Completed"}
              </label>
              {booking ? (
                <input
                  id="bulk_booked"
                  name="booked_for"
                  type="date"
                  value={bookedFor}
                  onChange={(e) => setBookedFor(e.target.value)}
                  className="mt-1 max-w-[10rem]"
                  required
                />
              ) : (
                <input
                  id="bulk_completed"
                  name="completed_on"
                  type="date"
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  className="mt-1 max-w-[10rem]"
                  required
                />
              )}
            </div>
          </div>

          {booking ? (
            <p className="text-xs text-white/45">
              {chosenCourses.size === 0
                ? "Choose the courses this session covers."
                : "A booking does not make a course compliant. These carers stay on the chasing list until the training itself is recorded."}
            </p>
          ) : renewals.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-white/45">
              {renewals.map((r) => (
                <li key={r.name}>
                  {r.name}:{" "}
                  {r.oneOff
                    ? "one off, no renewal"
                    : r.on
                      ? `renews ${r.on.split("-").reverse().join("/")}`
                      : `renews every ${r.months} months, once you pick a date`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/40">Choose the courses this session covered.</p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label htmlFor="bulk_search" className="form-label">
                {booking ? "Who is going" : "Who attended"}
              </label>
              <input
                id="bulk_search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="mt-1 w-full"
              />
            </div>
            <button type="button" onClick={toggleAllListed} className="btn-outline px-3 py-2 text-xs">
              {allListedPicked ? "Clear these" : "Select these"}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10">
            {listed.length === 0 ? (
              <p className="p-4 text-sm text-white/50">Nobody matches that name.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {listed.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-white/5">
                      <input
                        type="checkbox"
                        name="person_ids"
                        value={p.id}
                        checked={picked.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span className="text-white/85">{p.full_name}</span>
                      <span className="ml-auto text-xs text-white/40">{p.branch_name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            Anybody ticked and then searched away from stays ticked, and stays submitted: a
            hidden input carries them, because an unchecked box that is not in the DOM sends
            nothing and the manager would silently lose half her list.
          */}
          {[...picked]
            .filter((id) => !listed.some((p) => p.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="person_ids" value={id} />
            ))}

          <p className="text-xs text-white/50">
            {picked.size === 0
              ? "Nobody ticked yet."
              : chosenCourses.size > 0
                ? `${picked.size} ${picked.size === 1 ? "carer" : "carers"} ticked, ${picked.size * chosenCourses.size} records.`
                : `${picked.size} ${picked.size === 1 ? "carer" : "carers"} ticked.`}
          </p>
        </ActionForm>

        <div className="mt-3 flex">
          <button type="button" onClick={onClose} className="btn-ghost ml-auto px-3 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
