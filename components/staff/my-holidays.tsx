"use client";

/**
 * Be Care Compliant — a Team Member's own holidays.
 *
 * They can request holiday, and change or cancel their own BEFORE it starts (Thistle's request,
 * Phil's decisions by popup on 2026-10-09, migration 0438):
 *   - not decided yet: change the dates, or withdraw it;
 *   - approved: change the dates, which sends it back to their manager as a Change of holiday, or
 *     ask to cancel it, a Cancellation request. Either shows as waiting until decided; declined, it
 *     stays as it was agreed;
 *   - a change or cancellation waiting: they can take it back;
 *   - from the first day of the holiday, only the office can change it.
 * Every change and cancel needs a reason. The database enforces all of it (request_holiday_change,
 * request_holiday_cancel, withdraw_holiday_change), so a hidden button is not the only guard.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import HolidayDateFields from "@/components/holidays/holiday-date-fields";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import { briefingRenderSchema } from "@/lib/assignments/render";
import type { FormSchema } from "@/lib/form-schema";
import type { HolidayRequestRow } from "@/lib/holidays/data";
import {
  requestHoliday,
  requestHolidayChange,
  requestHolidayCancel,
  withdrawHolidayChange,
} from "@/lib/holidays/actions";
import { carerHolidayOptions, holidayStatusLabel, londonTodayIso } from "@/lib/holidays/changes";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmt(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** The day after a YYYY-MM-DD date, for the earliest new start a carer may pick. */
function dayAfter(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

function pillFor(h: HolidayRequestRow): string {
  if (h.status === "pending") return "pill pill-amber";
  if (h.status === "approved") return "pill pill-green";
  if (h.status === "declined") return "pill pill-red";
  return "pill pill-neutral";
}

type Mode = "none" | "dates" | "cancel" | "withdraw";

function MyRequestActions({ request, today }: { request: HolidayRequestRow; today: string }) {
  const [mode, setMode] = useState<Mode>("none");
  const options = carerHolidayOptions(request, today);
  const approved = request.status === "approved";
  const changeWaiting = request.status === "pending" && request.change_kind === "amend";
  const cancelWaiting = request.status === "pending" && request.change_kind === "cancel";
  const undecided = request.status === "pending" && !request.change_kind;
  const earliest = dayAfter(today);

  if (mode === "dates") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={requestHolidayChange}
          hidden={{ request_id: request.id }}
          onDone={() => setMode("none")}
          label={undecided ? "Save dates" : "Send change for approval"}
          savedLabel={undecided ? "Saved" : "Sent"}
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          {!undecided ? (
            <p className="text-xs text-white/60">
              This sends your holiday back to your manager to approve again, and it is not booked
              until they do. If they decline the change, your holiday stays on the dates already
              agreed.
            </p>
          ) : null}
          <HolidayDateFields
            idPrefix={`my-${request.id}`}
            start={request.start_date}
            end={request.end_date}
            returnToWork={request.return_to_work_date}
            min={earliest}
          />
          <label htmlFor={`my-change-reason-${request.id}`} className="form-label">
            Reason for the change
          </label>
          <textarea
            id={`my-change-reason-${request.id}`}
            name="change_reason"
            rows={2}
            required
            maxLength={2000}
            placeholder="Your manager will see this"
          />
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
          action={requestHolidayCancel}
          hidden={{ request_id: request.id }}
          label={undecided ? "Withdraw my request" : "Send cancellation for approval"}
          savedLabel={undecided ? "Withdrawn" : "Sent"}
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          {!undecided ? (
            <p className="text-xs text-white/60">
              This asks your manager to cancel it. Until they decide, it shows as waiting. If they
              decline, your holiday stays booked.
            </p>
          ) : null}
          <label htmlFor={`my-cancel-${request.id}`} className="form-label">
            Reason
          </label>
          <textarea
            id={`my-cancel-${request.id}`}
            name="cancel_reason"
            rows={2}
            required
            maxLength={2000}
            placeholder="Your manager will see this"
          />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Keep it
        </button>
      </div>
    );
  }

  if (mode === "withdraw") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={withdrawHolidayChange}
          hidden={{ request_id: request.id }}
          label={cancelWaiting ? "Keep my holiday" : "Take back my change"}
          savedLabel="Done"
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <p className="text-xs text-white/60">
            Your holiday goes back to the dates already agreed.
          </p>
          <label htmlFor={`my-withdraw-${request.id}`} className="form-label">
            Reason
          </label>
          <textarea
            id={`my-withdraw-${request.id}`}
            name="withdraw_reason"
            rows={2}
            required
            maxLength={2000}
            placeholder="Your manager will see this"
          />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Cancel
        </button>
      </div>
    );
  }

  const any = options.changeDates || options.cancel || options.withdrawChange;
  if (!any) {
    return options.started && (approved || request.status === "pending") ? (
      <p className="max-w-xs text-xs text-white/45">
        This holiday has started. Speak to your manager if it needs to change.
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.changeDates ? (
        <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setMode("dates")}>
          Change dates
        </button>
      ) : null}
      {options.cancel ? (
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setMode("cancel")}>
          {undecided ? "Withdraw" : "Ask to cancel"}
        </button>
      ) : null}
      {options.withdrawChange ? (
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setMode("withdraw")}>
          {cancelWaiting ? "Keep my holiday" : changeWaiting ? "Take back my change" : "Take it back"}
        </button>
      ) : null}
    </div>
  );
}

export default function MyHolidays({
  holidays,
  requestSchema,
}: {
  holidays: HolidayRequestRow[];
  requestSchema: FormSchema | null;
}) {
  const today = londonTodayIso();
  const current = holidays.filter(
    (h) => (h.status === "pending" || h.status === "approved") && h.end_date >= today,
  );
  const past = holidays.filter(
    (h) => !((h.status === "pending" || h.status === "approved") && h.end_date >= today),
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          My holidays
        </h2>
        {requestSchema ? (
          <FormEvidenceDialog
            title="Request holiday"
            /* The app already knows who they are, so it does not ask (see lib/assignments/render). */
            schema={briefingRenderSchema(requestSchema)}
            action={requestHoliday}
            triggerLabel="Request holiday"
            submitLabel="Send request"
          />
        ) : null}
      </div>

      {current.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          You have no holiday booked or waiting. Use Request holiday to ask for some.
        </div>
      ) : (
        <ul className="space-y-2">
          {current.map((h) => (
            <li
              key={h.id}
              className="glass-card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {fmt(h.start_date)} to {fmt(h.end_date)}
                </p>
                <span className={pillFor(h)}>{holidayStatusLabel(h)}</span>
                {h.status === "pending" && h.change_kind === "amend" && h.previous_start_date && h.previous_end_date ? (
                  <p className="mt-1 text-xs text-white/55">
                    Agreed before: {fmt(h.previous_start_date)} to {fmt(h.previous_end_date)}. Those
                    dates come back if your manager declines the change.
                  </p>
                ) : null}
                {h.status === "pending" && h.change_kind === "cancel" ? (
                  <p className="mt-1 text-xs text-white/55">You have asked to cancel this holiday.</p>
                ) : null}
              </div>
              <MyRequestActions request={h} today={today} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Earlier
          </h3>
          <ul className="space-y-1.5">
            {past.slice(0, 10).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-white/75">
                  {fmt(h.start_date)} to {fmt(h.end_date)}
                </span>
                <span className={pillFor(h)}>{holidayStatusLabel(h)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
