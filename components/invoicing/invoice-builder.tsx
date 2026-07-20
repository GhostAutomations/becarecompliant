"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { formatMoney } from "@/lib/invoicing/types";
import { carePlanLinesForPeriod } from "@/lib/invoicing/invoice-actions";
import { CARE_PLAN_UNITS, HANDED_OPTIONS, unitPricePence } from "@/lib/service-users/care-plan-consts";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Client = { id: string; name: string; invoice_to_label: string; invoice_delivery: string | null };
type ServiceRate = { label: string; hourly_pence: number; fixed_pence: number };
type Row = { service: string; unit: string; handed: string; quantity: string };

const HANDED_SUFFIX: Record<string, string> = { single: "Single Handed", double: "Double Handed" };

export type InvoiceBuilderInitial = {
  invoice_id: string;
  service_user_id: string | null;
  client_name: string;
  issue_date: string | null;
  due_date: string | null;
  supply_period_start: string | null;
  supply_period_end: string | null;
  notes: string | null;
  lines: { service: string | null; unit_label: string | null; handed: string | null; quantity: number }[];
};

export default function InvoiceBuilder({
  mode,
  action,
  clients,
  services,
  vatEnabled,
  today,
  initial,
}: {
  mode: "create" | "edit";
  action: ServerAction;
  clients: Client[];
  services: ServiceRate[];
  vatEnabled: boolean;
  today: string;
  initial?: InvoiceBuilderInitial;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [clientId, setClientId] = useState<string>(initial?.service_user_id ?? "");
  const [repeat, setRepeat] = useState(false);
  const [periodFrom, setPeriodFrom] = useState<string>(initial?.supply_period_start ?? "");
  const [periodTo, setPeriodTo] = useState<string>(initial?.supply_period_end ?? "");
  const [filling, startFill] = useTransition();
  const [rows, setRows] = useState<Row[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          service: l.service ?? services[0]?.label ?? "Care",
          unit: l.unit_label ?? "1hr",
          handed: l.handed ?? "single",
          quantity: String(l.quantity),
        }))
      : [{ service: services[0]?.label ?? "Care", unit: "1hr", handed: "single", quantity: "1" }],
  );

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  const rateFor = (label: string): ServiceRate | undefined => services.find((s) => s.label === label);

  const linesPence = useMemo(
    () =>
      rows.map((r) => {
        const q = Math.max(0, Number(r.quantity) || 0);
        const unit = unitPricePence(rateFor(r.service), r.unit, r.handed);
        return { unit_price_pence: unit, line_total: Math.round(unit * q) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, services],
  );
  const subtotal = linesPence.reduce((s, l) => s + l.line_total, 0);
  const vat = vatEnabled ? Math.round(subtotal * 0.2) : 0;
  const total = subtotal + vat;

  const linesJson = JSON.stringify(
    rows
      .filter((r) => r.service && r.unit && (Number(r.quantity) || 0) > 0)
      .map((r) => ({
        service: r.service,
        unit_label: r.unit,
        handed: r.handed,
        quantity: Number(r.quantity) || 0,
        unit_price_pence: unitPricePence(rateFor(r.service), r.unit, r.handed),
        description: `${r.service} - ${r.unit} (${HANDED_SUFFIX[r.handed] ?? "Single Handed"})`,
      })),
  );

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { service: services[0]?.label ?? "Care", unit: "1hr", handed: "single", quantity: "1" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function fillFromCarePlan(from: string, to: string) {
    if (!clientId || !from || !to) return;
    startFill(async () => {
      const res = await carePlanLinesForPeriod(clientId, from, to);
      if (res.lines.length > 0) {
        setRows(
          res.lines.map((l) => ({
            service: l.service,
            unit: l.unit,
            handed: l.handed,
            quantity: String(l.quantity),
          })),
        );
      }
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && initial ? <input type="hidden" name="invoice_id" value={initial.invoice_id} /> : null}
      <input type="hidden" name="service_user_id" value={clientId} />
      <input type="hidden" name="lines" value={linesJson} />

      <section className="glass-card space-y-4 p-5">
        {mode === "create" ? (
          <div>
            <label htmlFor="client" className="form-label">Client</label>
            <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Choose a private invoicing client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — invoice to {c.invoice_to_label.toLowerCase()}
                </option>
              ))}
            </select>
            {clients.length === 0 ? (
              <p className="form-hint">
                No private invoicing clients yet. Turn on Private invoicing on a Service User first.
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <label className="form-label">Client</label>
            <p className="pt-1 text-sm text-white/80">{initial?.client_name}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="issue_date" className="form-label">Issue date</label>
            <input id="issue_date" name="issue_date" type="date" defaultValue={initial?.issue_date ?? today} />
          </div>
          <div>
            <label htmlFor="due_date" className="form-label">Due date</label>
            <input id="due_date" name="due_date" type="date" defaultValue={initial?.due_date ?? ""} />
            <p className="form-hint">Leave blank to use your payment terms.</p>
          </div>
          <div>
            <label htmlFor="supply_period_start" className="form-label">Service period from</label>
            <input
              id="supply_period_start"
              name="supply_period_start"
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="supply_period_end" className="form-label">Service period to</label>
            <input
              id="supply_period_end"
              name="supply_period_end"
              type="date"
              value={periodTo}
              onChange={(e) => {
                setPeriodTo(e.target.value);
                fillFromCarePlan(periodFrom, e.target.value);
              }}
            />
          </div>
        </div>
        {clientId && periodFrom && periodTo ? (
          <button
            type="button"
            onClick={() => fillFromCarePlan(periodFrom, periodTo)}
            className="btn-outline text-xs"
            disabled={filling}
          >
            {filling ? "Filling…" : "Fill lines from care plan"}
          </button>
        ) : null}
      </section>

      <section className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white/80">Lines</h2>
        <div className="grid grid-cols-[1.2fr_1fr_1.3fr_0.8fr_5rem_1.5rem] items-center gap-2 text-center">
          <span className="text-xs uppercase tracking-wide text-white/45">Service</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Unit</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Handed</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Qty</span>
          <span className="text-xs uppercase tracking-wide text-white/45">Amount</span>
          <span />

          {rows.map((r, i) => (
            <div key={i} className="contents">
              <select
                aria-label="Service"
                value={r.service}
                onChange={(e) => updateRow(i, { service: e.target.value })}
                className="ctl-sm text-center"
              >
                {services.map((s) => (
                  <option key={s.label} value={s.label}>{s.label}</option>
                ))}
              </select>
              <select
                aria-label="Unit"
                value={r.unit}
                onChange={(e) => updateRow(i, { unit: e.target.value })}
                className="ctl-sm text-center"
              >
                {CARE_PLAN_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <select
                aria-label="Handed"
                value={r.handed}
                onChange={(e) => updateRow(i, { handed: e.target.value })}
                className="ctl-sm text-center"
              >
                {HANDED_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
              <input
                aria-label="Quantity"
                type="text"
                inputMode="decimal"
                value={r.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
                className="ctl-sm text-center"
              />
              <span className="text-center text-sm text-white/80">{formatMoney(linesPence[i]?.line_total ?? 0)}</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-white/40 hover:text-red-300"
                aria-label="Remove line"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="pt-1">
          <button type="button" onClick={addRow} className="btn-outline text-xs">Add line</button>
        </div>

        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between text-white/70">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {vatEnabled ? (
            <div className="flex justify-between text-white/70">
              <span>VAT (20%)</span>
              <span>{formatMoney(vat)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-white">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
      </section>

      <section className="glass-card space-y-2 p-5">
        <label htmlFor="notes" className="form-label">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Shown on the invoice." />
      </section>

      {mode === "create" ? (
        <section className="glass-card space-y-3 p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-white/90">
            <input type="checkbox" name="repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Repeat this invoice automatically
          </label>
          {repeat ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="frequency" className="form-label">Every</label>
                <div className="flex items-center gap-2">
                  <input name="interval_count" type="number" min={1} defaultValue={1} className="max-w-[5rem]" />
                  <select id="frequency" name="frequency" defaultValue="monthly" className="max-w-[10rem]">
                    <option value="weekly">week(s)</option>
                    <option value="monthly">month(s)</option>
                  </select>
                </div>
                <p className="form-hint">The next invoice drafts automatically on this cadence, starting after the issue date.</p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Saving…" : mode === "create" ? "Save draft" : "Save changes"}
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">{state.ok}</span> : null}
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
