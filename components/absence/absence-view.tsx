"use client";

/**
 * Be Care Compliant — Absence view (People sub-section).
 * Branch cards for ONLY the people who have absences recorded, each showing
 * their current stage / action (derived by lib/absence/logic from the rolling
 * window) and whether a formal meeting is due. Recording an absence or a meeting
 * completes the matching founder Form and stores immutable Evidence.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import AbsenceDetailDialog from "@/components/absence/absence-detail-dialog";
import BookMeetingDialog from "@/components/absence/book-meeting-dialog";
import type { FormSchema } from "@/lib/form-schema";
import type { AbsenceMethod } from "@/lib/absence/logic";
import type { AbsencePersonRow, PersonLite, AbsenceEventRow, OpenBookingRow } from "@/lib/absence/data";
import type { BranchLite } from "@/lib/people/data";
import { recordAbsence, recordAbsenceMeeting } from "@/lib/absence/actions";

/** 15 Jul 2026 from 2026-07-15, for the booked-meeting line. */
function formatBookedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AbsenceView({
  method,
  rows,
  branches,
  people,
  events,
  absenceSchema,
  meetingSchema,
  openBookings,
  canManage,
}: {
  method: AbsenceMethod;
  rows: AbsencePersonRow[];
  branches: BranchLite[];
  people: PersonLite[];
  events: AbsenceEventRow[];
  absenceSchema: FormSchema | null;
  meetingSchema: FormSchema | null;
  openBookings: OpenBookingRow[];
  canManage: boolean;
}) {
  const [branch, setBranch] = useState("");
  const [pickPerson, setPickPerson] = useState("");

  const eventsByPerson = useMemo(() => {
    const map: Record<string, AbsenceEventRow[]> = {};
    for (const e of events) (map[e.person_id] ??= []).push(e);
    return map;
  }, [events]);

  // Earliest open booking per person (a booked meeting awaiting recording).
  const bookingByPerson = useMemo(() => {
    const map: Record<string, OpenBookingRow> = {};
    for (const b of openBookings) map[b.person_id] ??= b;
    return map;
  }, [openBookings]);

  const visibleRows = useMemo(
    () => (branch ? rows.filter((r) => r.branchId === branch) : rows),
    [rows, branch],
  );
  const visiblePeople = useMemo(
    () => (branch ? people.filter((p) => p.branch_id === branch) : people),
    [people, branch],
  );
  const branchName = (id: string | null) =>
    branches.find((b) => b.id === id)?.name ?? "";

  return (
    <div className="mt-1 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Absence</h1>
          <p className="page-subtitle">
            People with absences in the current window. Tracking method:{" "}
            {method === "bradford" ? "Bradford Factor" : "Trigger points (stages)"}.
          </p>
        </div>
        {branches.length > 1 && (
          <div>
            <label htmlFor="absence-branch" className="form-label">
              Branch
            </label>
            <select
              id="absence-branch"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setPickPerson("");
              }}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Record a new absence (person picker, then the form). */}
      {canManage && (
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="absence-person" className="form-label">
              Record an absence for
            </label>
            <select
              id="absence-person"
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
          {absenceSchema && pickPerson ? (
            <FormEvidenceDialog
              title="Record an absence"
              schema={absenceSchema}
              action={recordAbsence}
              extraFields={{ person_id: pickPerson }}
              triggerLabel="Record absence"
              submitLabel="Save absence"
              hideFields={["name", "email"]}
            />
          ) : (
            <button type="button" className="btn-primary px-3 py-2 text-sm opacity-50" disabled>
              Record absence
            </button>
          )}
          {!absenceSchema && (
            <p className="w-full text-xs text-amber-300">
              The Absence Back Office form is not in this company yet, so absences
              cannot be recorded until it is imported.
            </p>
          )}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          No absences recorded{branch ? " for this branch" : ""}. People appear here
          once an absence is logged against them.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((r) => {
            const s = r.status;
            const pill =
              s.derivedStage != null && s.derivedStage >= 2
                ? "pill pill-red"
                : s.derivedLabel
                  ? "pill pill-amber"
                  : "pill pill-neutral";
            return (
              <div key={r.personId} className="glass-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/people/${r.personId}`}
                      className="truncate font-semibold text-white hover:text-gold-300"
                    >
                      {r.fullName}
                    </Link>
                    {branches.length > 1 && (
                      <p className="text-[11px] text-white/45">{branchName(r.branchId)}</p>
                    )}
                  </div>
                  <span className={pill}>{s.derivedLabel ?? "Below threshold"}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">{r.occasions}</div>
                    <div className="text-white/50">occasions</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">{r.totalDays}</div>
                    <div className="text-white/50">days</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">
                      {method === "bradford" ? s.bradfordScore : s.meetingStage ?? "—"}
                    </div>
                    <div className="text-white/50">
                      {method === "bradford" ? "Bradford" : "met. stage"}
                    </div>
                  </div>
                </div>

                {s.action && <p className="text-xs text-white/70">Action: {s.action}</p>}
                {s.meetingDue && (
                  <p className="text-xs font-medium text-amber-300">
                    A {s.derivedLabel ?? "stage"} meeting is due.
                  </p>
                )}
                {bookingByPerson[r.personId] && (
                  <p className="text-xs font-medium text-sky-300">
                    {bookingByPerson[r.personId].stage
                      ? `Stage ${bookingByPerson[r.personId].stage} meeting booked`
                      : "Meeting booked"}
                    {bookingByPerson[r.personId].meeting_date
                      ? `: ${formatBookedDate(bookingByPerson[r.personId].meeting_date!)}${bookingByPerson[r.personId].meeting_time ? ` at ${String(bookingByPerson[r.personId].meeting_time).slice(0, 5)}` : ""}`
                      : ""}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-evenly gap-2 pt-1">
                  {canManage && absenceSchema ? (
                      <FormEvidenceDialog
                        title={`Record absence — ${r.fullName}`}
                        schema={absenceSchema}
                        action={recordAbsence}
                        extraFields={{ person_id: r.personId }}
                        triggerLabel="Add absence"
                        triggerClassName="btn-outline px-3 py-1.5 text-xs"
                        submitLabel="Save absence"
                        hideFields={["name", "email"]}
                      />
                    ) : null}
                  <AbsenceDetailDialog
                    personName={r.fullName}
                    events={eventsByPerson[r.personId] ?? []}
                    canEdit={canManage}
                  />
                  {canManage ? (
                    <BookMeetingDialog
                      personId={r.personId}
                      personName={r.fullName}
                      defaultStage={Math.min(4, Math.max(1, (s.meetingStage ?? 0) + 1))}
                    />
                  ) : null}
                  {canManage && meetingSchema ? (
                      <FormEvidenceDialog
                        title={`Absence meeting — ${r.fullName}`}
                        schema={meetingSchema}
                        action={recordAbsenceMeeting}
                        extraFields={{ person_id: r.personId }}
                        triggerLabel="Record meeting"
                        triggerClassName="btn-outline px-3 py-1.5 text-xs"
                        submitLabel="Save meeting"
                        hideFields={["name"]}
                      />
                    ) : null}
                  </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
