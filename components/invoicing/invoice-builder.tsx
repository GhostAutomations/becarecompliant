"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { formatMoney } from "@/lib/invoicing/types";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Client = { id: string; name: string; invoice_to_label: string; invoice_delivery: string | null };
type Preset = { description: string; unit_price_pence: number };
type LineRow = { description: string; quantity: string; unitPrice: string };

export type InvoiceBuilderInitial = {
  invoice_id: string;
  service_user_id: string | null;
  client_name: string;
  issue_date: string | null;
  due_date: string | null;
  supply_period_start: string | null;
  supply_period_end: string | null;
  notes: string | null;
  lines: { description: string; quantity: number; unit_price_pence: number }[];
};

function penceFromPounds(s: string): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function InvoiceBuilder({
  mode,
  action,
  clients,
  presets,
  vatEnabled,
  today,
  initial,
}: {
  mode: "create" | "edit";
  action: ServerAction;
  clients: Client[];
  presets: Preset[];
  vatEnabled: boolean;
  today: string;
  initial?: InvoiceBuilderInitial;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [clientId, setClientId] = useState<string>(initial?.service_user_id ?? "");
  const [rows, setRows] = useState<LineRow[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: (l.unit_price_pence / 100).toFixed(2),
        }))
      : [{ description: "", quantity: "1", unitPrice: "" }],
  );

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  const linesPence = useMemo(
    () =>
      rows.map((r) => {
        const q = Math.max(0, Number(r.quantity) || 0);
        const unit = penceFromPounds(r.unitPrice);
        return { description: r.description.trim(), quantity: q, unit_price_pence: unit, line_total: Math.round(q * unit) };
      }),
    [rows],
  );
  const subtotal = linesPence.reduce((s, l) => s + l.line_total, 0);
  const vat = vatEnabled ? Math.round(subtotal * 0.2) : 0;
  const total = subtotal + vat;
  const linesJson = JSON.stringify(
    linesPence
      .filter((l) => l.description && (l.quantity > 0 || l.unit_price_pence > 0))
      .map((l) => ({ description: l.description, quantity: l.quantity, unit_price_pence: l.unit_price_pence })),
  );

  function updateRow(i: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addBlank() {
    setRows((prev) => [...prev, { description: "", quantity: "1", unitPrice: "" }]);
  }
  function addPreset(idx: string) {
    const p = presets[Number(idx)];
    if (!p) return;
    setRows((prev) => [
      ...prev,
      { description: p.description, quantity: "1", unitPrice: (p.unit_price_pence / 100).toFixed(2) },
    ]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
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
            <label htmlFor="supply_period_start" className="form-label">Service period from (optional)</label>
            <input id="supply_period_start" name="supply_period_start" type="date" defaultValue={initial?.supply_period_start ?? ""} />
          </div>
          <div>
            <label htmlFor="supply_period_end" className="form-label">Service period to (optional)</label>
            <input id="supply_period_end" name="supply_period_end" type="date" defaultValue={initial?.supply_period_end ?? ""} />
          </div>
        </div>
      </section>

      <section className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white/80">Lines</h2>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_7rem_6rem_2rem] items-center gap-2">
              <input
                aria-label="Description"
                placeholder="Description"
                list="line-templates"
                value={r.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
              />
              <input
                aria-label="Quantity"
                type="text"
                inputMode="decimal"
                value={r.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
              />
              <input
                aria-label="Unit price in pounds"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={r.unitPrice}
                onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
              />
              <span className="text-right text-sm text-white/80">{formatMoney(linesPence[i]?.line_total ?? 0)}</span>
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
        <datalist id="line-templates">
          {presets.map((p, i) => (
            <option key={i} value={p.description} />
          ))}
        </datalist>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={addBlank} className="btn-outline text-xs">Add line</button>
          {presets.length > 0 ? (
            <select
              aria-label="Add a template line"
              defaultValue=""
              onChange={(e) => {
                addPreset(e.target.value);
                e.currentTarget.selectedIndex = 0;
              }}
              className="max-w-[18rem] text-xs"
            >
              <option value="">Add a template line…</option>
              {presets.map((p, i) => (
                <option key={i} value={i}>{p.description} ({formatMoney(p.unit_price_pence)})</option>
              ))}
            </select>
          ) : null}
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
