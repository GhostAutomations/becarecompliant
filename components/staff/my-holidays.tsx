"use client";

/**
 * Be Care Compliant — a Team Member's own holidays.
 *
 * They can request holiday, and while a request is still pending they can change
 * its dates or withdraw it. Once a Manager has approved it the rota depends on it,
 * so from then on a Manager makes the change: the buttons disappear AND the
 * database refuses (cancel_holiday_request / amend_holiday_request), so this is a
 * real rule, not just a hidden button.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import type { FormSchema } from "@/lib/form-schema";
import type { HolidayRequestRow } from "@/lib/holidays/data";
import { requestHoliday, cancelHoliday, amendHoliday } from "@/lib/holidays/actions";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmt(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

const STATUS_PILL: Record<string, string> = {
  pending: "pill pill-amber",
  approved: "pill pill-green",
  declined: "pill pill-red",
  cancelled: "pill pill-neutral",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

function MyRequestActions({ request }: { request: HolidayRequestRow }) {
  const [mode, setMode] = useState<"none" | "dates" | "withdraw">("none");

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
              <label htmlFor={`my-start-${request.id}`} className="form-label">From</label>
              <input
                id={`my-start-${request.id}`}
                name="start_date"
                type="date"
                required
                defaultValue={request.start_date}
              />
            </div>
            <div>
              <label htmlFor={`my-end-${request.id}`} className="form-label">To</label>
              <input
                id={`my-end-${request.id}`}
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

  if (mode === "withdraw") {
    return (
      <div className="w-full max-w-sm space-y-2">
        <ActionForm
          action={cancelHoliday}
          hidden={{ request_id: request.id }}
          label="Withdraw my request"
          savedLabel="Withdrawn"
          buttonClassName="btn-primary px-3 py-1.5 text-xs"
        >
          <label htmlFor={`my-withdraw-${request.id}`} className="form-label">
            Reason (optional)
          </label>
          <textarea id={`my-withdraw-${request.id}`} name="cancel_reason" rows={2} maxLength={2000} />
        </ActionForm>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setMode("none")}>
          Keep it
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        onClick={() => setMode("dates")}
      >
        Change dates
      </button>
      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-xs"
        onClick={() => setMode("withdraw")}
      >
        Withdraw
      </button>
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
  const today = new Date().toISOString().slice(0, 10);
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
            schema={requestSchema}
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
                <span className={STATUS_PILL[h.status] ?? "pill pill-neutral"}>
                  {STATUS_LABEL[h.status] ?? h.status}
                </span>
              </div>
              {h.status === "pending" ? (
                <MyRequestActions request={h} />
              ) : (
                <p className="max-w-xs text-xs text-white/45">
                  Approved holiday is fixed. Speak to your manager if you need it changed.
                </p>
              )}
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
                <span className={STATUS_PILL[h.status] ?? "pill pill-neutral"}>
                  {STATUS_LABEL[h.status] ?? h.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
