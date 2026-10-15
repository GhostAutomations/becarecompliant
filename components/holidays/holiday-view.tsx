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
 *  - Plans change, so an approver can cancel a pending or approved holiday and can
 *    correct its dates, and the person who submitted it in the app can withdraw
 *    their own while it is still pending (migration 0130 enforces all of that).
 *  - Approvers (Phil, 11 Oct 2026, audit F7, 0444): a Branch Manager for their own
 *    branches, the Responsible Individual, Registered Manager and Admin. A Supervisor or
 *    Recruiter books, and the booking waits; they keep Withdraw on it. On their OWN holiday
 *    an approver is offered only Cancel (and Withdraw on what they booked): another
 *    approver decides it or moves its dates (officeHolidayActions).
 *  - 0438 (Phil, 2026-10-09): every edit and cancel carries a reason the person sees,
 *    and a carer's own change or cancellation of an approved holiday arrives here in
 *    Pending requests as a "Change of holiday" or a "Cancellation request", decided
 *    with the same Approve and Decline.
 *  - Clashes WARN, they never block: the Manager knows their rota and their cover.
 *  - Most requests now arrive through the public form link, so a submitter may
 *    have no account at all.
 */

import { useCallback, useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import { CentreDialog } from "@/components/panel-dialog";
import HolidayDateFields from "@/components/holidays/holiday-date-fields";
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
  requestHolidayCancel,
} from "@/lib/holidays/actions";
import { holidayHasStarted, londonTodayIso, officeChangeLabel, officeHolidayActions } from "@/lib/holidays/changes";
import { useBranchWord } from "@/components/branches/branch-word";
import BlackoutSection from "@/components/holidays/blackout-section";
import { blackoutClash, blackoutDates, blackoutMessage, blackoutsOn, type Blackout } from "@/lib/holidays/blackouts";

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
type ActionMode = "none" | "decline" | "dates" | "cancel" | "anyway";

type OfficeActions = ReturnType<typeof officeHolidayActions>;

function RequestActions({
  request,
  actions,
  initialMode = "none",
  onChoose,
  clash = null,
  canOverride = false,
}: {
  request: HolidayRequestRow;
  /** The blackout this pending request falls in (0477), or null. */
  clash?: Blackout | null;
  /** Admin, Responsible Individual or Registered Manager: may approve or book anyway (rule 5). */
  canOverride?: boolean;
  /** What this login may do to this holiday (officeHolidayActions): decide and edit dates for an
   *  approver on somebody else's holiday, cancel for an approver, withdraw for whoever booked it. */
  actions: OfficeActions;
  /** Opened straight onto Edit dates, Decline or Cancel (from a list row). */
  initialMode?: ActionMode;
  /** In a list row: Decline, Edit dates and Cancel open the holiday's popup instead of
   *  unfolding a form inside the row (Phil, 2026-10-09: "it cannot be that big"). */
  onChoose?: (mode: Exclude<ActionMode, "none">) => void;
}) {
  const [mode, setModeState] = useState<ActionMode>(initialMode);
  const setMode = (m: ActionMode) => (m !== "none" && onChoose ? onChoose(m) : setModeState(m));
  const pending = request.status === "pending";
  /* The office cancel, with a reason, for an approver; otherwise the booker's own withdraw. */
  const officeCancel = actions.cancel;

  /* APPROVE ANYWAY inside a blackout (0477, rule 5): a reason, then the database checks the role,
     stamps the reason on the holiday and logs it. */
  if (mode === "anyway") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={decideHoliday}
          hidden={{ request_id: request.id, decision: "approved", book_anyway: "1" }}
          label="Approve anyway"
          savedLabel="Approved"
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          {clash ? <p className="text-xs text-amber-300">{blackoutMessage(clash)}</p> : null}
          <label htmlFor={`anyway-${request.id}`} className="form-label">
            Reason for approving inside the blackout
          </label>
          <textarea id={`anyway-${request.id}`} name="blackout_override_reason" rows={2} required maxLength={300} />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Cancel
        </button>
      </div>
    );
  }

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
          /* Closes once saved, so the new dates show (Charlotte, 9 Oct: the box stayed open and
             looked as if nothing had happened). */
          onDone={() => setMode("none")}
          /* A pending request can be approved on its new dates in the same press (Phil, 9 Oct). */
          secondary={actions.decide && pending && request.change_kind !== "cancel" ? { label: "Save and approve", name: "then_approve", value: "1" } : undefined}
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <HolidayDateFields
            idPrefix={`amend-${request.id}`}
            start={request.start_date}
            end={request.end_date}
            returnToWork={request.return_to_work_date}
          />
          <label htmlFor={`amend-reason-${request.id}`} className="form-label">
            Reason for the change (the person will see this)
          </label>
          <textarea
            id={`amend-reason-${request.id}`}
            name="amend_reason"
            rows={2}
            required
            maxLength={2000}
            placeholder="For example: spoke to them and agreed the new dates"
          />
          {canOverride ? <BookAnywayFields idPrefix={`amend-anyway-${request.id}`} /> : null}
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
          action={officeCancel ? cancelHoliday : requestHolidayCancel}
          hidden={{ request_id: request.id }}
          label={officeCancel ? "Cancel this holiday" : "Withdraw my request"}
          savedLabel={officeCancel ? "Cancelled" : "Withdrawn"}
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <label htmlFor={`cancel-${request.id}`} className="form-label">
            Reason {officeCancel && !request.own ? "(the person will see this)" : ""}
          </label>
          <textarea
            id={`cancel-${request.id}`}
            name="cancel_reason"
            rows={2}
            maxLength={2000}
            required
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
      {request.own && pending ? (
        /* Their own request: another approver decides it (0444). */
        <span className="pill pill-amber">Waiting for another approver</span>
      ) : null}
      {actions.decide ? (
        <>
          {pending && clash && !request.change_kind ? (
            canOverride ? (
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setMode("anyway")}>
                Approve anyway
              </button>
            ) : (
              <span className="text-xs text-white/60">Inside a blackout: an Admin, Responsible Individual or Registered Manager can approve it.</span>
            )
          ) : (
            <ActionForm
              action={decideHoliday}
              hidden={{ request_id: request.id, decision: "approved" }}
              label="Approve"
              savedLabel="Approved"
              buttonClassName="btn-primary px-3 py-1.5 text-xs"
              className=""
            />
          )}
          <button
            type="button"
            className="btn-outline px-3 py-1.5 text-xs"
            onClick={() => setMode("decline")}
          >
            Decline
          </button>
        </>
      ) : null}
      {actions.editDates ? (
        <button
          type="button"
          className="btn-outline px-3 py-1.5 text-xs"
          onClick={() => setMode("dates")}
        >
          Edit dates
        </button>
      ) : null}
      {actions.cancel || actions.withdraw ? (
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setMode("cancel")}
        >
          {actions.cancel ? "Cancel" : "Withdraw"}
        </button>
      ) : null}
    </div>
  );
}

/** "Book anyway" with its reason (0477, rule 5), for an Admin, Responsible Individual or Registered
 *  Manager. Only used when the dates fall in a blackout; the database checks the role again. */
function BookAnywayFields({ idPrefix }: { idPrefix: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs text-white/80">
        <input type="checkbox" name="book_anyway" value="1" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Book anyway if these dates are in a blackout
      </label>
      {on ? (
        <>
          <label htmlFor={`${idPrefix}-reason`} className="form-label">Reason for booking inside the blackout</label>
          <input id={`${idPrefix}-reason`} name="blackout_override_reason" maxLength={300} required />
        </>
      ) : null}
    </div>
  );
}

/** Under the booking and request forms: the blackout the chosen dates fall in, and for an Admin,
 *  Responsible Individual or Registered Manager booking for someone, "Book anyway" (0477). */
function BlackoutPanel({
  blackouts,
  branchId,
  answers,
  canOverride,
  extras,
  setExtra,
}: {
  blackouts: Blackout[];
  branchId: string | null;
  answers: Record<string, unknown>;
  canOverride: boolean;
  extras: Record<string, string>;
  setExtra: (key: string, value: string) => void;
}) {
  const start = typeof answers["start_date_of_holiday"] === "string" ? (answers["start_date_of_holiday"] as string) : "";
  const end = typeof answers["end_date_of_holiday"] === "string" ? (answers["end_date_of_holiday"] as string) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  const clash = blackoutClash(blackouts, branchId, start, end);
  if (!clash) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <p>{blackoutMessage(clash)}</p>
      {canOverride ? (
        <>
          <label className="flex items-center gap-2 text-white/85">
            <input type="checkbox" checked={extras.book_anyway === "1"} onChange={(e) => setExtra("book_anyway", e.target.checked ? "1" : "")} />
            Book anyway
          </label>
          {extras.book_anyway === "1" ? (
            <div>
              <label htmlFor="book-anyway-reason" className="form-label">Reason for booking inside the blackout</label>
              <input
                id="book-anyway-reason"
                maxLength={300}
                value={extras.blackout_override_reason ?? ""}
                onChange={(e) => setExtra("blackout_override_reason", e.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-white/70">Choose other dates.</p>
      )}
    </div>
  );
}

export default function HolidayView({
  requests,
  branches,
  people,
  requestSchema,
  canApprove,
  approvableBranchIds,
  canBookForPerson,
  currentUserId,
  blackouts = [],
  managesBlackouts = false,
}: {
  requests: HolidayRequestRow[];
  branches: BranchLite[];
  people: PersonLite[];
  requestSchema: FormSchema | null;
  /** An approver role (isHolidayApprover): can approve, decline, amend and cancel, in the
   *  branches below and never on their own holiday. */
  canApprove: boolean;
  /** The branches whose requests this user may decide, or null for a company wide
   *  role that may decide any of them. A Branch Manager's authority comes from
   *  their branch, so a request with no branch is not theirs to approve and the
   *  database refuses it (0206). Without this the button was offered and the
   *  press came back as an error. */
  approvableBranchIds: string[] | null;
  /** An approver, a Supervisor or a Recruiter: can book a holiday for a person (a
   *  Supervisor's or Recruiter's booking is created pending until approved). */
  canBookForPerson: boolean;
  /** So someone can withdraw their own pending request. */
  currentUserId: string;
  /** Holiday blackout dates this login may see (0477). */
  blackouts?: Blackout[];
  /** Company Admin, Responsible Individual, Registered Manager or the Founder: manage blackouts
   *  and "Book anyway" inside one. The database enforces both. */
  managesBlackouts?: boolean;
}) {
  const bw = useBranchWord();
  /** An approver for this holiday's branch (before asking whose holiday it is). */
  const approverFor = (r: HolidayRequestRow) =>
    canApprove &&
    (approvableBranchIds === null ||
      (r.branch_id !== null && approvableBranchIds.includes(r.branch_id)));
  const actionsFor = (r: HolidayRequestRow) =>
    officeHolidayActions({
      status: r.status,
      approverForBranch: approverFor(r),
      own: r.own === true,
      bookedByMe: r.requested_by === currentUserId,
      changeInFlight: !!r.change_kind,
      started: holidayHasStarted(r, londonTodayIso()),
    });
  const offersAny = (a: OfficeActions) => a.decide || a.editDates || a.cancel || a.withdraw;

  const now = new Date();
  const [branch, setBranch] = useState("");
  const [pickPerson, setPickPerson] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [showHistory, setShowHistory] = useState(false);
  /** A blackout day tapped on the calendar: its reason, shown under the grid (0477). */
  const [boNote, setBoNote] = useState<string | null>(null);
  /* A name on the calendar opens that holiday (Phil, 2026-10-09: a manager clicked a booked
     holiday on the calendar and nothing happened). */
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<ActionMode>("none");
  const closeOpen = useCallback(() => setOpenId(null), []);
  const openHoliday = (id: string, mode: ActionMode = "none") => {
    setOpenMode(mode);
    setOpenId(id);
  };

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
  const branchNames = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const branchName = (id: string | null) => (id ? branchNames.get(id) ?? null : null);

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

  /** The blackout a live request falls in (0477), for the pill and the Approve anyway. */
  const blackoutFor = (r: HolidayRequestRow) =>
    r.status === "pending" || r.status === "approved" ? blackoutClash(blackouts, r.branch_id, r.start_date, r.end_date) : null;
  const personBranch = (id: string) => people.find((p) => p.id === id)?.branch_id ?? null;

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
          <p className="page-subtitle">Requests to review, and the {bw.oneLower} holiday calendar.</p>
        </div>
        <div className="flex items-end gap-3">
          {branches.length > 1 && (
            <div>
              <label htmlFor="holiday-branch" className="form-label">{bw.one}</label>
              <select id="holiday-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">{bw.all}</option>
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
                bottomPanel={(ctx) => (
                  <BlackoutPanel
                    blackouts={blackouts}
                    branchId={branches.length === 1 ? branches[0].id : null}
                    answers={ctx.answers}
                    canOverride={false}
                    extras={ctx.extras}
                    setExtra={ctx.setExtra}
                  />
                )}
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
              bottomPanel={(ctx) => (
                <BlackoutPanel
                  blackouts={blackouts}
                  branchId={personBranch(pickPerson)}
                  answers={ctx.answers}
                  canOverride={managesBlackouts}
                  extras={ctx.extras}
                  setExtra={ctx.setExtra}
                />
              )}
            />
          ) : (
            <button type="button" className="btn-primary px-3 py-2 text-sm opacity-50" disabled>
              Book holiday
            </button>
          )}
        </div>
      )}

      {/* Requests strip */}
      {/* Folded by default so the calendar keeps its space; open, it shows five and scrolls (Phil, 2026-10-06). */}
      <details className="fold glass-card group overflow-hidden">
        <FoldSummary label={`Pending requests (${pending.length})`} />
        <div className="border-t border-white/10 p-4">
        {pending.length === 0 ? (
          <p className="text-sm text-white/50">No requests waiting.</p>
        ) : (
          <ul className={`space-y-2${pending.length > 5 ? " max-h-[22rem] overflow-y-auto pr-1" : ""}`}>
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                    <span className="truncate">{r.requester_name ?? "Someone"}</span>
                    {officeChangeLabel(r) ? (
                      <span className="pill pill-amber">{officeChangeLabel(r)}</span>
                    ) : null}
                    {r.change_kind !== "cancel" && blackoutFor(r) ? (
                      <span className="pill pill-red" title={blackoutMessage(blackoutFor(r)!)}>Clashes with blackout</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-white/60">
                    {r.change_kind === "cancel" ? "Asks to cancel " : ""}
                    {fmt(r.start_date)} to {fmt(r.end_date)}
                    {r.return_to_work_date && r.change_kind !== "cancel" ? ` · Back at work ${fmt(r.return_to_work_date)}` : ""}
                    {r.note && !r.change_kind ? ` · ${r.note}` : ""}
                  </p>
                  {r.change_kind === "amend" && r.previous_start_date && r.previous_end_date ? (
                    <p className="text-xs text-white/50">
                      Agreed before: {fmt(r.previous_start_date)} to {fmt(r.previous_end_date)}.
                      Declining puts those dates back.
                    </p>
                  ) : null}
                  {r.change_kind === "cancel" ? (
                    <p className="text-xs text-white/50">Declining keeps the holiday booked.</p>
                  ) : null}
                  {r.change_kind && r.change_reason ? (
                    <p className="text-xs text-white/60">Reason: {r.change_reason}</p>
                  ) : null}
                  {r.change_kind === "cancel" ? null : clashLine(r)}
                </div>
                {offersAny(actionsFor(r)) ? (
                  <RequestActions
                    request={r}
                    actions={actionsFor(r)}
                    onChoose={(m) => openHoliday(r.id, m)}
                    clash={blackoutFor(r)}
                    canOverride={managesBlackouts}
                  />
                ) : (
                  <span className="pill pill-amber">Pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
        </div>
      </details>

      {/* Booked holidays still to come: the ones a Manager may need to move. */}
      {canApprove && upcoming.length > 0 && (
        <details className="fold glass-card group overflow-hidden">
          <FoldSummary label={`Booked, still to come (${upcoming.length})`} />
          <div className="border-t border-white/10 p-4">
          <ul className={`space-y-2${upcoming.length > 5 ? " max-h-[22rem] overflow-y-auto pr-1" : ""}`}>
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
                    {r.return_to_work_date ? ` · Back at work ${fmt(r.return_to_work_date)}` : ""}
                  </p>
                </div>
                <RequestActions request={r} actions={actionsFor(r)} onChoose={(m) => openHoliday(r.id, m)} canOverride={managesBlackouts} />
              </li>
            ))}
          </ul>
          </div>
        </details>
      )}

      {/* BLACKOUT DATES (0477): when holidays can't be booked. Managed by the Company Admin,
          Responsible Individual and Registered Manager; seen by everyone on this page. */}
      <details className="fold glass-card group overflow-hidden">
        <FoldSummary label={`Blackout dates (${blackouts.filter((b) => b.end >= today).length})`} />
        <div className="border-t border-white/10 p-4">
          <BlackoutSection
            blackouts={blackouts}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            holidays={requests.map((r) => ({ id: r.id, name: r.requester_name, branchId: r.branch_id, start: r.start_date, end: r.end_date, status: r.status }))}
            manages={managesBlackouts}
            todayIso={today}
          />
        </div>
      </details>

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
          {blackouts.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500/30 ring-1 ring-red-400/60" /> Blackout, no holidays
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-white/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1">{d}</div>
          ))}
        </div>
        {/* Each day holds five rows of names, two side by side from tablet width up, so ten
            names before it scrolls inside its own box (Phil, 2026-10-06). On a phone a day is too
            narrow for two, so it is one column of five.
            Every chip is a fixed 19px (15px line plus padding) with a 2px gap, so the list box is
            5 x 19 + 4 x 2 = 103px and the sixth name always sits just out of view. */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="rounded-lg bg-white/[0.02]" />;
            const hols = holidaysOn(day);
            /* A blackout day is shaded red, its reason on hover or tap (0477). */
            const bo = blackoutsOn(blackouts, iso(year, month, day), branch || null);
            const boTitle = bo.map((b) => `No holidays: ${b.reason} (${blackoutDates(b.start, b.end)}${b.allBranches ? "" : `, ${b.branchIds.map((id) => branchName(id) ?? "branch").join(", ")}`})`).join(". ");
            return (
              /* Every day is the same size; a busy day scrolls inside its own box rather than
                 hiding names behind "+1 more" (Phil, 2026-10-06). */
              <div
                key={i}
                className={`flex flex-col rounded-lg p-1 text-left ${bo.length > 0 ? "bg-red-500/15 ring-1 ring-inset ring-red-400/50" : "bg-white/5"}`}
                title={bo.length > 0 ? boTitle : undefined}
              >
                <div className="flex shrink-0 items-center justify-between gap-1 text-[11px] leading-4 text-white/50">
                  <span>{day}</span>
                  {bo.length > 0 ? (
                    <button
                      type="button"
                      className="truncate rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-red-200"
                      title={boTitle}
                      aria-label={boTitle}
                      onClick={() => setBoNote(`${day} ${MONTHS[month]}: ${boTitle}`)}
                    >
                      No holidays
                    </button>
                  ) : null}
                </div>
                <div
                  className="mt-0.5 grid h-[103px] grid-cols-1 content-start gap-0.5 overflow-y-auto md:grid-cols-2"
                  // Reachable by keyboard, so names past the tenth can be scrolled to (review, 2026-10-07).
                  tabIndex={hols.length > 5 ? 0 : undefined}
                  aria-label={hols.length > 5 ? `${hols.length} people off on the ${day}` : undefined}
                >
                  {hols.map((h) => (
                    <button
                      type="button"
                      key={h.id}
                      onClick={() => openHoliday(h.id)}
                      aria-haspopup="dialog"
                      className={`flex min-w-0 cursor-pointer items-baseline justify-between gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-[15px] hover:brightness-125 ${
                        h.status === "approved"
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-amber-400/20 text-amber-200"
                      }`}
                      title={`${h.requester_name ?? ""}${branchName(h.branch_id) ? `, ${branchName(h.branch_id)}` : ""}${h.status === "pending" ? " (awaiting approval)" : ""}. Click to open.`}
                    >
                      {/* First name on the left, branch or house on the right, each cut short with an
                          ellipsis rather than spilling into the next column (Phil, 2026-10-06). */}
                      {/* The name comes first and keeps its room; the branch takes what is left.
                          On a phone, or when one branch is already chosen, the branch is not
                          shown at all, as there is no room or no need (review, 2026-10-07). */}
                      <span className="min-w-0 shrink truncate">{(h.requester_name ?? "").split(" ")[0]}</span>
                      {!branch && branchName(h.branch_id) && (
                        <span className="hidden min-w-0 flex-1 truncate text-right opacity-70 md:inline">
                          {branchName(h.branch_id)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {boNote ? (
          <p className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-100">
            <span>{boNote}</span>
            <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setBoNote(null)}>
              Close
            </button>
          </p>
        ) : null}
        {onCalendar.length === 0 && (
          <p className="mt-3 text-xs text-white/50">No holidays to show yet.</p>
        )}
      </div>

      {/* THE HOLIDAY A CALENDAR NAME OPENS: its dates, status and reason, with the same buttons as
          the lists above, offered only to whoever may decide it. A holiday already cancelled,
          declined or over is shown, not offered for change. */}
      {(() => {
        const r = openId ? requests.find((x) => x.id === openId) ?? null : null;
        const live = !!r && (r.status === "pending" || (r.status === "approved" && r.end_date >= today));
        const statusText = !r
          ? ""
          : r.status === "pending"
            ? officeChangeLabel(r) ?? "Awaiting approval"
            : r.status === "approved"
              ? r.end_date < today ? "Taken" : "Approved"
              : r.status === "declined" ? "Declined" : "Cancelled";
        return (
          <CentreDialog open={!!r} onClose={closeOpen} label={r ? `Holiday: ${r.requester_name ?? "Someone"}` : "Holiday"}>
            {r ? (
              <div className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`pill ${r.status === "approved" ? "pill-green" : r.status === "pending" ? "pill-amber" : r.status === "declined" ? "pill-red" : "pill-neutral"}`}
                  >
                    {statusText}
                  </span>
                  {branchName(r.branch_id) ? <span className="text-xs text-white/50">{branchName(r.branch_id)}</span> : null}
                </div>
                <p className="text-sm text-white">
                  {r.change_kind === "cancel" ? "Asks to cancel " : ""}
                  {fmt(r.start_date)} to {fmt(r.end_date)}
                  {r.return_to_work_date ? ` · Back at work ${fmt(r.return_to_work_date)}` : ""}
                </p>
                {r.note && !r.change_kind ? <p className="text-xs text-white/60">{r.note}</p> : null}
                {r.change_kind === "amend" && r.previous_start_date && r.previous_end_date ? (
                  <p className="text-xs text-white/50">
                    Agreed before: {fmt(r.previous_start_date)} to {fmt(r.previous_end_date)}. Declining puts those dates back.
                  </p>
                ) : null}
                {r.change_kind && r.change_reason ? <p className="text-xs text-white/60">Reason: {r.change_reason}</p> : null}
                {r.status === "declined" && r.decision_note ? <p className="text-xs text-white/60">Reason: {r.decision_note}</p> : null}
                {r.status === "cancelled" && r.cancel_reason ? <p className="text-xs text-white/60">Reason: {r.cancel_reason}</p> : null}
                {live && r.change_kind !== "cancel" ? clashLine(r) : null}
                {r.blackout_override_reason ? (
                  <p className="text-xs text-amber-300">Booked inside a blackout: {r.blackout_override_reason}</p>
                ) : r.status === "pending" && r.change_kind !== "cancel" && blackoutFor(r) ? (
                  <p className="text-xs text-red-300">{blackoutMessage(blackoutFor(r)!)}</p>
                ) : null}
                {live && offersAny(actionsFor(r)) ? (
                  <div className="border-t border-white/10 pt-3">
                    <RequestActions
                      key={`${r.id}:${openMode}`}
                      request={r}
                      actions={actionsFor(r)}
                      initialMode={openMode}
                      clash={blackoutFor(r)}
                      canOverride={managesBlackouts}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </CentreDialog>
        );
      })()}

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

/** The heading of a folded list: the same summary row and chevron as the Getting set up card. */
function FoldSummary({ label }: { label: string }) {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
      <span className="text-sm font-semibold text-white/80">{label}</span>
      <span aria-hidden className="fold-chevron shrink-0 text-lg text-white/40 transition-transform">
        ›
      </span>
    </summary>
  );
}
