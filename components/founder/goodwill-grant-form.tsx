"use client";

import { useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import { createGoodwillGrant } from "@/lib/founder/goodwill-actions";
import {
  GOODWILL_FREQUENCIES,
  GOODWILL_REASONS,
  goodwillSummary,
  parseGoodwillForm,
  type GoodwillFrequency,
} from "@/lib/billing/goodwill-schedule";

/**
 * The New grant form (Phil, 2026-10-14). Every value is held here, so a refused save keeps what
 * was typed; the summary sentence is drawn live as it is filled in, and is the question the
 * confirm step asks before anything is given.
 */
export default function GoodwillGrantForm({
  companies,
  today,
}: {
  companies: Array<{ id: string; name: string; isTest: boolean }>;
  today: string;
}) {
  const blank = {
    search: "",
    company_id: "",
    sms: "",
    ai: "",
    frequency: "once" as GoodwillFrequency,
    start: today,
    how_long: "times",
    times: "",
    end: "",
    reason: "complaint",
    note: "",
  };
  const [v, setV] = useState(blank);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const shown = useMemo(() => {
    const q = v.search.trim().toLowerCase();
    return companies.filter((c) => !q || c.name.toLowerCase().includes(q) || c.id === v.company_id);
  }, [companies, v.search, v.company_id]);

  const company = companies.find((c) => c.id === v.company_id);
  const parsed = parseGoodwillForm(v, today);
  const summary =
    parsed.ok && company
      ? goodwillSummary({
          company: company.name,
          sms: parsed.value.sms,
          ai: parsed.value.ai,
          plan: { start: parsed.value.start, frequency: parsed.value.frequency, times: parsed.value.times, endDate: parsed.value.endDate },
        })
      : null;

  return (
    <ActionForm
      action={createGoodwillGrant}
      label="Give the credits"
      savingLabel="Giving…"
      savedLabel="Done"
      showOk
      confirm={summary ?? undefined}
      onDone={() => setV(blank)}
      className="mt-4 space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="gw_search" className="form-label">Company *</label>
          <input id="gw_search" value={v.search} onChange={set("search")} placeholder="Type to find a company" autoComplete="off" />
          <select name="company_id" value={v.company_id} onChange={set("company_id")} className="mt-2" aria-label="Company">
            <option value="">Choose a company</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isTest ? " (test)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="gw_sms" className="form-label">SMS credits</label>
            <input id="gw_sms" name="sms" inputMode="numeric" value={v.sms} onChange={set("sms")} placeholder="0" />
          </div>
          <div>
            <label htmlFor="gw_ai" className="form-label">AI credits</label>
            <input id="gw_ai" name="ai" inputMode="numeric" value={v.ai} onChange={set("ai")} placeholder="0" />
          </div>
          <p className="form-hint col-span-2">Either can be 0, but not both. They never expire.</p>
        </div>
        <div>
          <label htmlFor="gw_frequency" className="form-label">How often *</label>
          <select id="gw_frequency" name="frequency" value={v.frequency} onChange={set("frequency")}>
            {Object.entries(GOODWILL_FREQUENCIES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gw_start" className="form-label">Start date *</label>
          <input id="gw_start" name="start" type="date" min={today} value={v.start} onChange={set("start")} />
          <p className="form-hint">Today gives the first credits straight away.</p>
        </div>
        {v.frequency !== "once" ? (
          <>
            <div>
              <label htmlFor="gw_how_long" className="form-label">How long *</label>
              <select id="gw_how_long" name="how_long" value={v.how_long} onChange={set("how_long")}>
                <option value="times">A number of times</option>
                <option value="end">Until an end date</option>
              </select>
            </div>
            {v.how_long === "end" ? (
              <div>
                <label htmlFor="gw_end" className="form-label">End date *</label>
                <input id="gw_end" name="end" type="date" min={v.start || today} value={v.end} onChange={set("end")} />
                <p className="form-hint">A grant due on the end date is still given.</p>
              </div>
            ) : (
              <div>
                <label htmlFor="gw_times" className="form-label">How many times *</label>
                <input id="gw_times" name="times" inputMode="numeric" value={v.times} onChange={set("times")} placeholder="6" />
              </div>
            )}
          </>
        ) : null}
        <div>
          <label htmlFor="gw_reason" className="form-label">Reason *</label>
          <select id="gw_reason" name="reason" value={v.reason} onChange={set("reason")}>
            {Object.entries(GOODWILL_REASONS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <p className="form-hint">Only you see the reason.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="gw_note" className="form-label">Private note</label>
          <textarea id="gw_note" name="note" rows={2} maxLength={2000} value={v.note} onChange={set("note")} />
          <p className="form-hint">Only you see this. The company never does.</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
        {summary ? (
          <span className="text-white">{summary}</span>
        ) : (
          <span className="text-white/50">
            {company ? parsed.ok ? "" : parsed.error : "Choose the company and the credits to see the summary here."}
          </span>
        )}
      </div>
    </ActionForm>
  );
}
