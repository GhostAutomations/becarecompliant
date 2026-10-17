"use client";

/**
 * Be Care Compliant: setting a service user's MAR (Rota and Visits Stage 6, Phil's popups
 * 2026-10-17; docs/decisions/rota-visits.md, Stage 6). Medicines come from the NHS list (dm+d);
 * every addition or change waits for a second check by a different Supervisor or above before
 * carers can record it; stopping is immediate. Stock: received, given (from the doses) and
 * corrected. Record, never decide: the dose is typed exactly as it is on the label.
 */

import { useEffect, useMemo, useState } from "react";
import ActionForm from "@/components/rota/rota-action";
import LabelPhotoInput from "@/components/rota/label-photo-input";
import { checkMedicineAction, saveMedicineAction, searchDmdAction, stockMedicineAction, stopMedicineAction, withdrawMedicineAction, type DmdHit } from "@/lib/rota/mar-actions";
import { DAY_SHORT, LOW_STOCK_DAYS, MAR_SLOTS, SUPPORT_SHORT, SUPPORT_WORDS, dayWords, daysOfStock, slotWords, type Support } from "@/lib/rota/mar";
import type { MarMed } from "@/lib/rota/mar-data";

function ukDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function MedSummary({ m }: { m: MarMed }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold text-white">
        {m.name}
        {m.timeSensitive ? <span className="pill pill-red ml-2">Time sensitive</span> : null}
        {m.prn ? <span className="pill pill-neutral ml-2">When required</span> : null}
      </p>
      <p className="text-xs text-white/75">
        {m.doseText}
        {m.doseQuantity ? ` (${m.doseQuantity} ${m.doseUnit ?? ""} a dose)`.replace(" )", ")") : ""}
        {m.route ? ` · ${m.route}` : ""}
        {m.form ? ` · ${m.form}` : ""}
      </p>
      <p className="text-xs text-white/60">
        {m.prn ? "Given only when needed" : `${slotWords(m.slots)}, ${dayWords(m.days).toLowerCase()}`} · {SUPPORT_SHORT[m.support]}
        {` · from ${ukDate(m.startDate)}`}
        {m.stopDate ? ` to ${ukDate(m.stopDate)}` : ""}
        {m.reviewDate ? ` · review ${ukDate(m.reviewDate)}` : ""}
      </p>
      {m.instructions ? <p className="text-xs text-white/60">{m.instructions}</p> : null}
      {m.hasLabel ? (
        <a href={`/api/rota/mar-label/${m.id}`} target="_blank" rel="noreferrer" className="inline-block text-xs text-amber-300 underline">
          View the label photo
        </a>
      ) : m.labelSkipReason ? (
        <p className="text-xs text-amber-300">No label photo: {m.labelSkipReason}</p>
      ) : null}
    </div>
  );
}

export function MedicineForm({ serviceUserId, med, dmdReady, onDone }: { serviceUserId: string; med?: MarMed; dmdReady: boolean; onDone?: () => void }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<DmdHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<{ id: string | null; name: string; form: string | null; routes: string[] } | null>(
    med ? { id: med.dmdId, name: med.name, form: med.form, routes: med.route ? [med.route] : [] } : null,
  );
  const [route, setRoute] = useState(med?.route ?? "");
  const [prn, setPrn] = useState(med?.prn ?? false);

  useEffect(() => {
    if (chosen || term.trim().length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchDmdAction(term);
      setHits(res.hits ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [term, chosen]);

  return (
    <ActionForm
      action={saveMedicineAction}
      hidden={{
        service_user_id: serviceUserId,
        med_uid: med?.medUid ?? "",
        dmd_id: chosen?.id ?? "",
        name: chosen?.name ?? "",
        form: chosen?.form ?? "",
        route,
      }}
      label={med ? "Save the change" : "Add medicine"}
      savingLabel="Saving…"
      savedLabel="Saved"
      buttonClassName="btn-primary px-4 py-2 text-sm"
      className="space-y-3"
      showOk
      onDone={onDone}
    >
      <div className="space-y-1">
        <span className="text-xs text-white/70">Medicine (from the NHS list)</span>
        {chosen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="text-sm text-white">{chosen.name}</span>
            {!med ? (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setChosen(null)}>
                Choose another
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={dmdReady ? "Type the name, e.g. paracetamol 500mg tablets" : "The NHS list is not loaded yet"}
              disabled={!dmdReady}
              aria-label="Search the NHS list"
            />
            {searching ? <p className="text-xs text-white/50">Searching…</p> : null}
            {hits.length ? (
              <ul className="max-h-64 overflow-y-auto rounded-lg border border-white/10" role="listbox" aria-label="Medicines found">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                      onClick={() => {
                        setChosen({ id: h.id, name: h.name, form: h.form, routes: h.routes });
                        setRoute(h.routes.length === 1 ? h.routes[0] : "");
                      }}
                    >
                      {h.name}
                      <span className="block text-xs text-white/50">{[h.form, h.routes.join(", ")].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : term.trim().length >= 3 && !searching ? (
              <p className="text-xs text-white/50">Nothing found. Try fewer words, or the generic name.</p>
            ) : null}
          </>
        )}
      </div>

      {chosen && chosen.routes.length > 1 ? (
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Route</span>
          <select value={route} onChange={(e) => setRoute(e.target.value)} required>
            <option value="">Pick the route on the label…</option>
            {chosen.routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs text-white/70">Dose, exactly as it is on the label</span>
        <input name="dose_text" required maxLength={300} defaultValue={med?.doseText ?? ""} placeholder="e.g. Take TWO tablets" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Quantity in each dose (for stock)</span>
          <input name="dose_quantity" type="number" min="0.25" step="0.25" defaultValue={med?.doseQuantity ?? ""} placeholder={prn ? "The carer enters it" : "e.g. 2"} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Unit</span>
          <input name="dose_unit" maxLength={30} defaultValue={med?.doseUnit ?? ""} placeholder="e.g. tablet, ml, patch" />
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs text-white/70">Support the carer gives</legend>
        {(Object.keys(SUPPORT_WORDS) as Support[]).map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm text-white/85">
            <input type="radio" name="support" value={s} defaultChecked={(med?.support ?? "give") === s} />
            {SUPPORT_WORDS[s]}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-white/85">
        <input type="checkbox" name="prn" checked={prn} onChange={(e) => setPrn(e.target.checked)} />
        When required (given only when needed, shown at every visit)
      </label>

      {!prn ? (
        <>
          <fieldset className="space-y-1">
            <legend className="text-xs text-white/70">Given at these calls</legend>
            <div className="flex flex-wrap gap-3">
              {MAR_SLOTS.map((s) => (
                <label key={s.value} className="flex items-center gap-1.5 text-sm text-white/85">
                  <input type="checkbox" name="slots" value={s.value} defaultChecked={med?.slots.includes(s.value) ?? false} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-xs text-white/70">On these days</legend>
            <div className="flex flex-wrap gap-3">
              {DAY_SHORT.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 text-sm text-white/85">
                  <input type="checkbox" name="days" value={i} defaultChecked={!med?.days || med.days.includes(i)} />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-white/85">
        <input type="checkbox" name="time_sensitive" defaultChecked={med?.timeSensitive ?? false} />
        Time sensitive (must be given on time, e.g. Parkinson&apos;s or insulin)
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-white/70">Other instructions on the label</span>
        <textarea name="instructions" rows={2} maxLength={1000} defaultValue={med?.instructions ?? ""} placeholder="e.g. Take with food. Do not crush." />
      </label>
      <LabelPhotoInput />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Start date</span>
          <input name="start_date" type="date" defaultValue={med?.startDate ?? ""} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Stop date (if known)</span>
          <input name="stop_date" type="date" defaultValue={med?.stopDate ?? ""} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/70">Review date (if known)</span>
          <input name="review_date" type="date" defaultValue={med?.reviewDate ?? ""} />
        </label>
      </div>
    </ActionForm>
  );
}

function LiveMed({ m, balance, serviceUserId, dmdReady }: { m: MarMed; balance: number | null; serviceUserId: string; dmdReady: boolean }) {
  const [mode, setMode] = useState<null | "change" | "stop" | "stock">(null);
  const days = daysOfStock({ prn: m.prn, slots: m.slots, days: m.days, start_date: m.startDate, stop_date: m.stopDate, dose_quantity: m.doseQuantity }, balance);
  return (
    <li className={`space-y-2 rounded-xl border p-3 ${m.timeSensitive ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/5"}`}>
      <MedSummary m={m} />
      <p className={`text-xs ${days != null && days < LOW_STOCK_DAYS ? "text-amber-300" : "text-white/55"}`}>
        Stock: {balance == null ? "not recorded" : `${balance} ${m.doseUnit ?? ""}`.trim()}
        {days != null ? ` · about ${days} day${days === 1 ? "" : "s"} left${days < LOW_STOCK_DAYS ? ", order more" : ""}` : ""}
        {m.checkedByName ? ` · checked by ${m.checkedByName}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline px-3 py-1 text-xs" onClick={() => setMode(mode === "change" ? null : "change")}>
          Change
        </button>
        <button type="button" className="btn-outline px-3 py-1 text-xs" onClick={() => setMode(mode === "stock" ? null : "stock")}>
          Stock
        </button>
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setMode(mode === "stop" ? null : "stop")}>
          Stop
        </button>
      </div>
      {mode === "change" ? (
        <div className="rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs text-amber-200">A change waits for a second check; until then carers are told to call the office for this medicine.</p>
          <MedicineForm serviceUserId={serviceUserId} med={m} dmdReady={dmdReady} onDone={() => setMode(null)} />
        </div>
      ) : null}
      {mode === "stop" ? (
        <ActionForm
          action={stopMedicineAction}
          hidden={{ med_uid: m.medUid }}
          label="Stop it now"
          savingLabel="Stopping…"
          savedLabel="Stopped"
          buttonClassName="btn-outline px-3 py-1 text-xs"
          className="flex flex-wrap items-end gap-2"
          confirm={`Stop ${m.name}? Carers stop seeing it straight away.`}
        >
          <label className="min-w-[14rem] flex-1">
            <span className="sr-only">Why it is stopped</span>
            <input name="reason" required maxLength={500} placeholder="Why it is stopped, e.g. GP stopped it on 17/10" />
          </label>
        </ActionForm>
      ) : null}
      {mode === "stock" ? (
        <ActionForm
          action={stockMedicineAction}
          hidden={{ med_uid: m.medUid }}
          label="Save stock"
          savingLabel="Saving…"
          savedLabel="Saved"
          buttonClassName="btn-outline px-3 py-1 text-xs"
          className="grid gap-2 sm:grid-cols-4"
        >
          <select name="kind" defaultValue="received" aria-label="Received or correction">
            <option value="received">Received</option>
            <option value="corrected">Correct the count</option>
          </select>
          <input name="quantity" type="number" step="0.25" required placeholder="Quantity (a correction can be minus)" aria-label="Quantity" />
          <input name="reason" maxLength={500} placeholder="Reason (needed for a correction)" aria-label="Reason" className="sm:col-span-2" />
        </ActionForm>
      ) : null}
    </li>
  );
}

export default function MarEditor({
  serviceUserId,
  meds,
  balances,
  myProfileId,
  dmdReady,
}: {
  serviceUserId: string;
  meds: MarMed[];
  balances: Record<string, number | null>;
  myProfileId: string;
  dmdReady: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const waiting = useMemo(() => meds.filter((m) => m.status === "awaiting_check"), [meds]);
  const live = useMemo(() => meds.filter((m) => m.status === "live").sort((a, b) => Number(a.prn) - Number(b.prn) || a.name.localeCompare(b.name)), [meds]);
  const stopped = useMemo(() => meds.filter((m) => m.status === "stopped"), [meds]);

  return (
    <div className="space-y-5">
      {waiting.length ? (
        <section className="glass-card space-y-3 border-amber-500/40 p-4" aria-label="Waiting for a second check">
          <h2 className="text-base font-semibold text-white">Waiting for a second check ({waiting.length})</h2>
          <p className="text-xs text-white/60">A different Supervisor or above checks each one against the label photo, or the prescription or label itself. Until then carers are told to call the office.</p>
          <ul className="space-y-2">
            {waiting.map((m) => (
              <li key={m.id} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <MedSummary m={m} />
                <p className="text-xs text-white/55">
                  Set by {m.setByName ?? "someone"} on {ukDate(m.setAt)}
                  {live.some((l) => l.medUid === m.medUid) ? " · a change to a live medicine" : " · new"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {m.setBy === myProfileId ? (
                    <span className="text-xs text-white/50">You set this, so someone else must check it.</span>
                  ) : (
                    <ActionForm
                      action={checkMedicineAction}
                      hidden={{ medicine_id: m.id }}
                      label="Checked: make it live"
                      savingLabel="Checking…"
                      savedLabel="Live"
                      buttonClassName="btn-primary px-3 py-1 text-xs"
                      className=""
                      confirm={`Have you checked ${m.name}, the dose, the calls and the dates against the label photo or the prescription?`}
                    />
                  )}
                  <ActionForm
                    action={withdrawMedicineAction}
                    hidden={{ medicine_id: m.id }}
                    label="Withdraw"
                    savingLabel="Withdrawing…"
                    savedLabel="Withdrawn"
                    buttonClassName="btn-ghost px-3 py-1 text-xs"
                    className=""
                    confirm="Withdraw this? Any live version stays as it is."
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="glass-card space-y-3 p-4" aria-label="Medicines">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">Medicines ({live.length})</h2>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add medicine"}
          </button>
        </div>
        {adding ? (
          <div className="rounded-xl border border-white/10 p-3">
            <MedicineForm serviceUserId={serviceUserId} dmdReady={dmdReady} onDone={() => setAdding(false)} />
          </div>
        ) : null}
        {live.length === 0 ? <p className="text-sm text-white/55">No live medicines. Add them from the prescription or the pharmacy label; each needs a second check.</p> : null}
        <ul className="space-y-2">
          {live.map((m) => (
            <LiveMed key={m.id} m={m} balance={balances[m.medUid] ?? null} serviceUserId={serviceUserId} dmdReady={dmdReady} />
          ))}
        </ul>
      </section>

      {stopped.length ? (
        <details className="glass-card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white/80">Stopped ({stopped.length})</summary>
          <ul className="mt-3 space-y-2">
            {stopped.map((m) => (
              <li key={m.id} className="rounded-lg bg-white/5 p-3 opacity-80">
                <MedSummary m={m} />
                <p className="text-xs text-white/55">
                  Stopped {ukDate(m.stoppedAt)}: {m.stopReason}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
