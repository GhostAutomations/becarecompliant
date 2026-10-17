"use client";

/**
 * Be Care Compliant: the doses due at a visit, on the carer's Clock in page (Rota and Visits Stage
 * 6, Phil's popups 2026-10-17; docs/decisions/rota-visits.md, Stage 6). Only the doses due at this
 * call, plus the when required medicines with when each was last given. Given, or not given with
 * a reason (Refused, Not available, Other). Saved on the phone first and sent when there is signal.
 *
 * Record, never decide: the label is shown as it was entered; nothing is worked out. A carer
 * without an in date Medication Competency sees the doses and "call the office"; a medicine new or
 * changed and not yet checked by the office says so and cannot be recorded.
 */

import { useState } from "react";
import { azOtherLast } from "@/lib/rota/az";
import {
  NOT_AVAILABLE_REASONS,
  OUTCOME_LABELS,
  REFUSED_REASONS,
  SUPPORT_SHORT,
  doseProblem,
  doseReasonLabel,
  type DoseOutcome,
  type PhoneMed,
} from "@/lib/rota/mar";

export type RecordDose = (med: PhoneMed, outcome: DoseOutcome, reason: string | null, text: string, quantity: number | null) => Promise<void>;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function when(iso: string): string {
  const d = new Date(iso);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
  return `${day === today ? "today" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" })} ${hhmm(iso)}`;
}

function DoseRow({ m, competent, onRecord }: { m: PhoneMed & { waitingSend: boolean }; competent: boolean; onRecord: RecordDose }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<DoseOutcome>("refused");
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState<string>(m.dose_quantity ? String(m.dose_quantity) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const recordable = competent && Boolean(m.medicine_id) && !m.waiting;
  const givenHere = m.recorded?.outcome === "given";

  async function save(o: DoseOutcome) {
    const quantity = o === "given" ? (qty ? Number(qty) : null) : null;
    const problem = doseProblem({ outcome: o, reason: o === "given" || o === "other" ? null : reason, text, quantity, prn: m.prn });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRecord(m, o, o === "given" ? null : o === "other" ? "other" : reason, text, quantity);
      setOpen(false);
      setAgain(false);
    } catch {
      setError("It could not be saved on this phone. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const reasons: readonly { code: string; label: string }[] = outcome === "refused" ? REFUSED_REASONS : NOT_AVAILABLE_REASONS;
  return (
    <li className={`space-y-1.5 rounded-lg px-3 py-2 ${m.time_sensitive ? "border border-red-500/50 bg-red-500/10" : "bg-white/5"}`}>
      <p className="text-sm font-semibold text-white">
        {m.name}
        {m.time_sensitive ? <span className="pill pill-red ml-2">Time sensitive</span> : null}
        {m.prn ? <span className="pill pill-neutral ml-2">When required</span> : null}
      </p>
      <p className="text-sm text-white/90">{m.dose_text}</p>
      <p className="text-xs text-white/60">
        {SUPPORT_SHORT[m.support]}
        {m.route ? ` · ${m.route}` : ""}
        {m.form ? ` · ${m.form}` : ""}
      </p>
      {m.instructions ? <p className="text-xs text-white/70">{m.instructions}</p> : null}
      {m.prn ? (
        <p className="text-xs text-white/70">
          {m.last_given ? `Last given ${when(m.last_given.at)}${m.last_given.quantity ? `, ${m.last_given.quantity} ${m.dose_unit ?? ""}` : ""}` : "Not given before on this list"}. Follow the label; call the office if unsure.
        </p>
      ) : null}
      {m.recorded ? (
        <p className={`text-xs ${m.recorded.outcome === "given" ? "text-emerald-300" : "text-amber-300"}`}>
          {OUTCOME_LABELS[m.recorded.outcome]} {hhmm(m.recorded.at)}
          {m.recorded.quantity ? `, ${m.recorded.quantity} ${m.dose_unit ?? ""}` : ""}
          {m.recorded.reason_code ? `: ${doseReasonLabel(m.recorded.reason_code, m.recorded.reason_text)}` : ""}
          {m.waitingSend ? " (waiting to send)" : ""}
        </p>
      ) : null}

      {m.waiting ? (
        <p className="text-xs text-amber-200">New or changed, and not yet checked by the office. Do not give it from this list: call the office.</p>
      ) : !competent ? null : (
        <>
          {m.prn && (!givenHere || again) ? (
            <label className="flex items-center gap-2 text-xs text-white/75">
              How many given
              <input className="w-24" type="number" min="0.25" step="0.25" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="How many given" />
              {m.dose_unit ?? ""}
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {givenHere && !again ? (
              m.prn ? (
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setAgain(true)}>
                  Record another dose
                </button>
              ) : null
            ) : (
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={saving || !recordable} onClick={() => save("given")}>
                {saving ? "Saving…" : "Given"}
              </button>
            )}
            <button type="button" className="btn-outline px-3 py-1.5 text-xs" disabled={saving || !recordable} onClick={() => setOpen((v) => !v)}>
              Not given
            </button>
          </div>
          {open ? (
            <div className="space-y-2 rounded-lg border border-white/10 p-2">
              <div className="flex flex-wrap gap-3 text-sm text-white/85" role="radiogroup" aria-label="Why not given">
                {(["refused", "not_available", "other"] as DoseOutcome[]).map((o) => (
                  <label key={o} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={outcome === o}
                      onChange={() => {
                        setOutcome(o);
                        setReason(null);
                      }}
                    />
                    {OUTCOME_LABELS[o]}
                  </label>
                ))}
              </div>
              {outcome !== "other" ? (
                <select value={reason ?? ""} onChange={(e) => setReason(e.target.value || null)} aria-label="Reason">
                  <option value="">Pick a reason…</option>
                  {azOtherLast(reasons, (r) => r.label).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {outcome === "other" || reason === "other" ? (
                <input type="text" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the reason" aria-label="Reason" />
              ) : null}
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={saving} onClick={() => save(outcome)}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </>
      )}
    </li>
  );
}

export default function VisitDosesPanel({
  meds,
  competent,
  allergies,
  canRecord,
  onRecord,
}: {
  meds: (PhoneMed & { waitingSend: boolean })[];
  competent: boolean;
  allergies: string | null;
  /** The visit is open or the carer has clocked in. */
  canRecord: boolean;
  onRecord: RecordDose;
}) {
  if (meds.length === 0) return null;
  const regular = meds.filter((m) => !m.prn);
  const prn = meds.filter((m) => m.prn);
  return (
    <details className="rounded-lg border border-white/10 p-2" open={canRecord}>
      <summary className="cursor-pointer text-xs font-semibold text-white/75">
        Medicines ({regular.length} due{prn.length ? `, ${prn.length} when required` : ""})
      </summary>
      <div className="mt-2 space-y-2">
        {allergies ? (
          <p className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200">Allergies: {allergies}</p>
        ) : (
          <p className="text-xs text-amber-300">Allergies not recorded. Call the office if you are unsure.</p>
        )}
        {!competent ? (
          <p className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-100">
            You cannot record doses yet: your Medication Competency is missing or overdue. Call the office.
          </p>
        ) : null}
        <ul className="space-y-1.5">
          {[...regular, ...prn].map((m) => (
            <DoseRow key={m.med_uid} m={m} competent={competent && canRecord} onRecord={onRecord} />
          ))}
        </ul>
      </div>
    </details>
  );
}
