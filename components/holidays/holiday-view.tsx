"use client";

/**
 * Be Care Compliant — Holiday view (People sub-section).
 *
 * Pending requests to decide, the holidays already booked, a month calendar for
 * the branch, and the history of anything declined or cancelled.
 *
 * Standing rules baked in here:
 *  - Approving is a DECISION, not a form. The Holiday Response form was deleted
 *    in migration 0129: Approve is one click, Decline asks for a reason. Never
 *    reintroduce a form for the yes or no.
 *  - Plans change, so a Manager can cancel a pending or approved holiday and can
 *    correct its dates, and the person who submitted it in the app can withdraw
 *    their own while it is still pending (migration 0130 enforces all of that).
 *  - Clashes WARN, they never block: the Manager knows their rota and their cover.
 *  - Most requests now arrive through the public form link, so a submitter may
 *    have no account at all.
 */

import { useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import type { FormSchema } from "@/lib/form-schema";
import type { HolidayRequestRow } from "@/lib/holidays/data";
import type { BranchLite } from "@/lib/people/data";
import type { PersonLite } from "@/lib/absence/data";
import {
  requestHoliday,
  decideHoliday,
  bookHolidayForPerson,
  cancelHoliday,
  amendHoliday,
} from "@/lib/holidays/actions";

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
function todayIso(): string {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Two date ranges touch (inclusive at both ends). */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * The actions on one holiday: approve, decline, edit the dates, cancel, or
 * withdraw your own. Each destructive or fiddly one opens its own small panel
 * rather than firing on a single click.
 */
function RequestActions({
  request,
  canManage,
  canWithdraw,
}: {
  request: HolidayRequestRow;
  /** Branch Manager and above: decide, amend, cancel. */
  canManage: boolean;
  /** This user submitted it and it is still pending. */
  canWithdraw: boolean;
}) {
  const [mode, setMode] = useState<"none" | "decline" | "dates" | "cancel">("none");
  const pending = request.status === "pending";

  if (mode === "decline") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={decideHoliday}
          hidden={{ request_id: request.id, decision: "declined" }}
          label="Decline request"
          savedLabel="Declined"
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <label htmlFor={`decline-${request.id}`} className="form-label">
            Reason for declining
          </label>
          <textarea
            id={`decline-${request.id}`}
            name="decline_reason"
            rows={2}
            required
            maxLength={2000}
            placeholder="The person will see this"
          />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "dates") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={amendHoliday}
          hidden={{ request_id: request.id }}
          label="Save dates"
          savedLabel="Saved"
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`start-${request.id}`} className="form-label">From</label>
              <input
                id={`start-${request.id}`}
                name="start_date"
                type="date"
                required
                defaultValue={request.start_date}
              />
            </div>
            <div>
              <label htmlFor={`end-${request.id}`} className="form-label">To</label>
              <input
                id={`end-${request.id}`}
                name="end_date"
                type="date"
                required
                defaultValue={request.end_date}
              />
            </div>
          </div>
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "cancel") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={cancelHoliday}
          hidden={{ request_id: request.id }}
          label={canManage ? "Cancel this holiday" : "Withdraw my request"}
          savedLabel={canManage ? "Cancelled" : "Withdrawn"}
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <label htmlFor={`cancel-${request.id}`} className="form-label">
            Reason {canManage ? "(the person will see this)" : "(optional)"}
          </label>
          <textarea
            id={`cancel-${request.id}`}
            name="cancel_reason"
            rows={2}
            maxLength={2000}
            required={canManage}
          />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Keep it
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && pending ? (
        <>
          <ActionForm
            action={decideHoliday}
            hidden={{ request_id: request.id, decision: "approved" }}
            label="Approve"
            savedLabel="Approved"
            buttonClassName="btn-primary px-3 py-1.5 text-xs"
            className=""
          />
          <button
            type="button"
            className="btn-outline px-3 py-1.5 text-xs"
            onClick={() => setMode("decline")}
          >
            Decline
          </button>
        </>
      ) : null}
      {canManage ? (
        <button
          type="button"
          className="btn-outline px-3 py-1.5 text-xs"
          onClick={() => setMode("dates")}
        >
          Edit dates
        </button>
      ) : null}
      {canManage || canWithdraw ? (
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setMode("cancel")}
        >
          {canManage ? "Cancel" : "Withdraw"}
        </button>
      ) : null}
    </div>
  );
}

export default function HolidayView({
  requests,
  branches,
  people,
  requestSchema,
  canApprove,
  canBookForPerson,
  currentUserId,
}: {
  requests: HolidayRequestRow[];
  branches: BranchLite[];
  people: PersonLite[];
  requestSchema: FormSchema | null;
  /** Branch Manager and above: can approve, decline, amend and cancel. */
  canApprove: boolean;
  /** Branch Manager and above + Supervisor: can book a holiday for a person (a
   *  Supervisor's booking is created pending until approved). */
  canBookForPerson: boolean;
  /** So someone can withdraw their own pending request. */
  currentUserId: string;
}) {
  const now = new Date();
  const [branch, setBranch] = useState("");
  const [pickPerson, setPickPerson] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [showHistory, setShowHistory] = useState(false);

  const visiblePeople = branch ? people.filter((p) => p.branch_id === branch) : people;
  const today = todayIso();

  const scoped = useMemo(
    () => (branch ? requests.filter((r) => r.branch_id === branch) : requests),
    [requests, branch],
  );
  const pending = scoped.filter((r) => r.status === "pending");
  // Booked holidays that have not finished yet: the ones a Manager might still
  // need to move or cancel. Past ones stay in the calendar and on the record.
  const upcoming = scoped
    .filter((r) => r.status === "approved" && r.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const history = scoped
    .filter((r) => r.status === "declined" || r.status === "cancelled")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  // Calendar shows approved (green) AND pending (amber, awaiting approval).
  const onCalendar = scoped.filter((r) => r.status === "approved" || r.status === "pending");

  /**
   * Who else in the same branch is off across these dates. Worked out here from
   * the requests the page already holds, so there is no extra round trip, and it
   * respects RLS for free: a Manager only ever sees their own branches.
   */
  const clashesFor = (r: HolidayRequestRow) =>
    requests.filter(
      (other) =>
        other.id !== r.id &&
        other.branch_id === r.branch_id &&
        (other.status === "approved" || other.status === "pending") &&
        overlaps(r.start_date, r.end_date, other.start_date, other.end_date),
    );

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

  const clashLine = (r: HolidayRequestRow) => {
    const clashes = clashesFor(r);
    if (clashes.length === 0) return null;
    return (
      <p className="mt-1 text-xs text-amber-300">
        {clashes.length === 1 ? "1 other person is" : `${clashes.length} others are`} off in this
        branch over these dates:{" "}
        {clashes
          .slice(0, 3)
          .map((c) => `${c.requester_name ?? "Someone"} (${fmt(c.start_date)} to ${fmt(c.end_date)})`)
          .join(", ")}
        {clashes.length > 3 ? `, and ${clashes.length - 3} more` : ""}.
      </p>
    );
  };

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
                    {r.return_to_work_date ? ` · Back at work ${fmt(r.return_to_work_date)}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                  {clashLine(r)}
                </div>
                {canApprove || r.requested_by === currentUserId ? (
                  <RequestActions
                    request={r}
                    canManage={canApprove}
                    canWithdraw={r.requested_by === currentUserId}
                  />
                ) : (
                  <span className="pill pill-amber">Pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Booked holidays still to come: the ones a Manager may need to move. */}
      {canApprove && upcoming.length > 0 && (
        <div className="glass-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">
            Booked, still to come ({upcoming.length})
          </h2>
          <ul className="space-y-2">
            {upcoming.map((r) => (
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
                  </p>
                </div>
                <RequestActions request={r} canManage canWithdraw={false} />
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Declined and cancelled: they leave the calendar, but the decision and the
          reason stay readable. */}
      {history.length > 0 && (
        <div className="glass-card p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowHistory((v) => !v)}
          >
            <h2 className="text-sm font-semibold text-white/80">
              Declined and cancelled ({history.length})
            </h2>
            <span className="text-xs text-white/50">{showHistory ? "Hide" : "Show"}</span>
          </button>
          {showHistory && (
            <ul className="mt-3 space-y-2">
              {history.map((r) => (
                <li key={r.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">
                      {r.requester_name ?? "Someone"}
                    </p>
                    <span className={r.status === "declined" ? "pill pill-red" : "pill pill-neutral"}>
                      {r.status === "declined" ? "Declined" : "Cancelled"}
                    </span>
                  </div>
                  <p className="text-xs text-white/60">
                    {fmt(r.start_date)} to {fmt(r.end_date)}
                  </p>
                  {r.status === "declined" && r.decision_note ? (
                    <p className="mt-1 text-xs text-white/50">Reason: {r.decision_note}</p>
                  ) : null}
                  {r.status === "cancelled" && r.cancel_reason ? (
                    <p className="mt-1 text-xs text-white/50">Reason: {r.cancel_reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
