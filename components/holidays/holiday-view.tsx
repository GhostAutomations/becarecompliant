"use client";

/**
 * Be Care Compliant — Holiday view (People sub-section).
 * Top: a request strip (pending requests; Managers/Admins approve or decline via
 * the Holiday Response form). Below: a month calendar of approved holidays for
 * the branch. Anyone can submit their own request (Holiday Form -> Evidence).
 */

import { useMemo, useState } from "react";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import type { FormSchema } from "@/lib/form-schema";
import type { HolidayRequestRow } from "@/lib/holidays/data";
import type { BranchLite } from "@/lib/people/data";
import type { PersonLite } from "@/lib/absence/data";
import { requestHoliday, decideHoliday, bookHolidayForPerson } from "@/lib/holidays/actions";

const HOLIDAY_HIDE_FOR_PERSON = [
  "name",
  "please_enter_your_email_address",
  "what_area_do_you_work_for",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function fmt(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]?.slice(0, 3)} ${y}`;
}

export default function HolidayView({
  requests,
  branches,
  people,
  requestSchema,
  responseSchema,
  canApprove,
  canBookForPerson,
}: {
  requests: HolidayRequestRow[];
  branches: BranchLite[];
  people: PersonLite[];
  requestSchema: FormSchema | null;
  responseSchema: FormSchema | null;
  /** Branch Manager and above: can approve/decline pending requests. */
  canApprove: boolean;
  /** Branch Manager and above + Supervisor: can book a holiday for a person (a
   *  Supervisor's booking is created pending until approved). */
  canBookForPerson: boolean;
}) {
  const now = new Date();
  const [branch, setBranch] = useState("");
  const [pickPerson, setPickPerson] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  const visiblePeople = branch ? people.filter((p) => p.branch_id === branch) : people;

  const scoped = useMemo(
    () => (branch ? requests.filter((r) => r.branch_id === branch) : requests),
    [requests, branch],
  );
  const pending = scoped.filter((r) => r.status === "pending");
  const approved = scoped.filter((r) => r.status === "approved");
  // Calendar shows approved (green) AND pending (amber, awaiting approval).
  const onCalendar = scoped.filter((r) => r.status === "approved" || r.status === "pending");

  // Month grid (Monday-first).
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const holidaysOn = (day: number) => {
    const d = iso(year, month, day);
    return onCalendar.filter((r) => r.start_date <= d && d <= r.end_date);
  };

  function stepMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
  }

  return (
    <div className="mt-1 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Holiday</h1>
          <p className="page-subtitle">Requests to review, and the branch holiday calendar.</p>
        </div>
        <div className="flex items-end gap-3">
          {branches.length > 1 && (
            <div>
              <label htmlFor="holiday-branch" className="form-label">Branch</label>
              <select id="holiday-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* Self-request for anyone without the booking picker; branch staff use the
              "Book holiday for" picker below. */}
          {!canBookForPerson &&
            (requestSchema ? (
              <FormEvidenceDialog
                title="Request holiday"
                schema={requestSchema}
                action={requestHoliday}
                triggerLabel="Request holiday"
                submitLabel="Submit request"
              />
            ) : (
              <button type="button" className="btn-primary px-3 py-2 text-sm opacity-50" disabled>
                Request holiday
              </button>
            ))}
        </div>
      </div>

      {!requestSchema && (
        <p className="text-xs text-amber-300">
          The Holiday Form is not in this company yet, so requests cannot be submitted
          until it is imported.
        </p>
      )}

      {/* Branch staff: book holiday on behalf of a person. Manager+ books directly;
          a Supervisor's booking is created pending approval. */}
      {canBookForPerson && requestSchema && (
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="holiday-person" className="form-label">
              Book holiday for
            </label>
            <select
              id="holiday-person"
              value={pickPerson}
              onChange={(e) => setPickPerson(e.target.value)}
            >
              <option value="">Choose a person…</option>
              {visiblePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          {pickPerson ? (
            <FormEvidenceDialog
              title="Book holiday"
              schema={requestSchema}
              action={bookHolidayForPerson}
              extraFields={{ person_id: pickPerson }}
              hideFields={HOLIDAY_HIDE_FOR_PERSON}
              triggerLabel="Book holiday"
              submitLabel="Book holiday"
            />
          ) : (
            <button type="button" className="btn-primary px-3 py-2 text-sm opacity-50" disabled>
              Book holiday
            </button>
          )}
        </div>
      )}

      {/* Requests strip */}
      <div className="glass-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Pending requests ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-white/50">No requests waiting.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {r.requester_name ?? "Someone"}
                  </p>
                  <p className="text-xs text-white/60">
                    {fmt(r.start_date)} to {fmt(r.end_date)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                {canApprove && responseSchema ? (
                  <FormEvidenceDialog
                    title={`Review holiday — ${r.requester_name ?? ""}`}
                    schema={responseSchema}
                    action={decideHoliday}
                    extraFields={{ request_id: r.id }}
                    triggerLabel="Review"
                    triggerClassName="btn-outline px-3 py-1.5 text-xs"
                    submitLabel="Save decision"
                  />
                ) : (
                  <span className="pill pill-amber">Pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Calendar */}
      <div className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex gap-1">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => stepMonth(-1)}>
              ← Prev
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }}
            >
              Today
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => stepMonth(1)}>
              Next →
            </button>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-4 text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/40" /> Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400/40" /> Awaiting approval
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-white/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="min-h-16 rounded-lg bg-white/[0.02]" />;
            const hols = holidaysOn(day);
            return (
              <div key={i} className="min-h-16 rounded-lg bg-white/5 p-1 text-left">
                <div className="text-[11px] text-white/50">{day}</div>
                <div className="mt-0.5 space-y-0.5">
                  {hols.slice(0, 2).map((h) => (
                    <div
                      key={h.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] ${
                        h.status === "approved"
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-amber-400/20 text-amber-200"
                      }`}
                      title={`${h.requester_name ?? ""}${h.status === "pending" ? " (awaiting approval)" : ""}`}
                    >
                      {(h.requester_name ?? "").split(" ")[0]}
                    </div>
                  ))}
                  {hols.length > 2 && (
                    <div className="px-1 text-[10px] text-white/50">+{hols.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {onCalendar.length === 0 && (
          <p className="mt-3 text-xs text-white/50">No holidays to show yet.</p>
        )}
      </div>
    </div>
  );
}
