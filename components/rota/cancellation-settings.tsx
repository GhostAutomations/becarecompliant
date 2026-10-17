"use client";

/**
 * Be Care Compliant: Settings, Rota, the cancellations part (Stage 7b part 2b; decisions 5, 6, 9
 * and 16). The company's reasons, each saying whether a short notice cancellation is still charged
 * and whether the carer is still paid, and the rules: a default for each branch and, where a council
 * or health board works differently, a rule of the funder's own.
 *
 * Rows hold their own state and call the action directly (as the funding options form does), so a
 * save never resets what is on screen and the green Saved stays until the row is edited.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  addCancelReasonAction,
  clearFunderRuleAction,
  saveCancelReasonAction,
  saveCancelRuleAction,
  setCancelReasonArchivedAction,
} from "@/lib/rota/cancellation-actions";
import { DEFAULT_CANCEL_RULE, RULE_FIELDS, durationWords, splitHours, type CancelReason, type CancelRule, type DurationUnit } from "@/lib/rota/cancellations";
import type { ActionState } from "@/lib/forms";

type RuleRowData = { scopeId: string; name: string; rule: CancelRule | null; archived?: boolean };

function useRowSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, flash, reset] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);
  function run(action: (p: ActionState, fd: FormData) => Promise<ActionState>, fd: FormData) {
    start(async () => {
      const r = await action({}, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      setError(null);
      flash();
      router.refresh();
    });
  }
  function touched() {
    reset();
    setError(null);
  }
  return { pending, saved, error, run, touched };
}

function ReasonRow({ r }: { r: CancelReason }) {
  const [label, setLabel] = useState(r.label);
  const [chargeable, setChargeable] = useState(r.chargeable);
  const [paid, setPaid] = useState(r.carerPaid);
  const s = useRowSave();
  const isOther = r.code === "other";

  function save() {
    const fd = new FormData();
    fd.set("reason_id", r.id);
    fd.set("label", label);
    if (chargeable) fd.set("chargeable", "on");
    if (paid) fd.set("carer_paid", "on");
    s.run(saveCancelReasonAction, fd);
  }

  return (
    <li className={`rounded-xl border border-white/10 px-3 py-3 ${r.archivedAt ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          {isOther ? (
            <p className="text-sm font-medium text-white/85">Other <span className="text-xs font-normal text-white/50">(the office types the reason)</span></p>
          ) : (
            <input
              aria-label="Reason"
              value={label}
              maxLength={80}
              disabled={!!r.archivedAt || s.pending}
              onChange={(e) => {
                setLabel(e.target.value);
                s.touched();
              }}
            />
          )}
          {r.archivedAt ? <span className="pill pill-neutral mt-1 inline-block">Archived</span> : null}
        </div>
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input type="checkbox" checked={chargeable} disabled={!!r.archivedAt || s.pending} onChange={(e) => { setChargeable(e.target.checked); s.touched(); }} />
          Charged if short notice
        </label>
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input type="checkbox" checked={paid} disabled={!!r.archivedAt || s.pending} onChange={(e) => { setPaid(e.target.checked); s.touched(); }} />
          Carer paid if short notice
        </label>
        <div className="flex items-center gap-2">
          {r.archivedAt ? null : (
            <button type="button" onClick={save} disabled={s.pending} className={s.saved ? "btn-saved text-xs" : "btn-primary text-xs"}>
              {s.pending ? "Saving…" : s.saved ? "Saved" : "Save"}
            </button>
          )}
          {isOther ? null : (
            <ActionForm
              key={r.archivedAt ? "archived" : "live"}
              action={setCancelReasonArchivedAction}
              hidden={{ reason_id: r.id, archive: r.archivedAt ? "0" : "1" }}
              label={r.archivedAt ? "Restore" : "Archive"}
              savingLabel={r.archivedAt ? "Restoring…" : "Archiving…"}
              savedLabel={r.archivedAt ? "Restored" : "Archived"}
              buttonClassName="btn-outline text-xs"
              confirm={r.archivedAt ? undefined : `Archive ${r.label}? It leaves the list the office picks from; visits already cancelled for it keep it.`}
            />
          )}
        </div>
      </div>
      {s.error ? <p className="mt-1 text-xs text-red-300">{s.error}</p> : null}
    </li>
  );
}

function RuleFields({ values, onChange, disabled }: { values: Record<string, { value: string; unit: DurationUnit }>; onChange: (name: string, v: { value: string; unit: DurationUnit }) => void; disabled: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {RULE_FIELDS.map((f) => (
        <div key={f.name}>
          <span className="form-label">{f.label}</span>
          <div className="flex gap-2">
            <input
              aria-label={`${f.label} number`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values[f.name].value}
              disabled={disabled}
              onChange={(e) => onChange(f.name, { ...values[f.name], value: e.target.value })}
            />
            <select
              aria-label={`${f.label} hours or days`}
              value={values[f.name].unit}
              disabled={disabled}
              onChange={(e) => onChange(f.name, { ...values[f.name], unit: e.target.value as DurationUnit })}
            >
              <option value="days">days</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

function initialValues(rule: CancelRule): Record<string, { value: string; unit: DurationUnit }> {
  const out: Record<string, { value: string; unit: DurationUnit }> = {};
  for (const f of RULE_FIELDS) {
    const { value, unit } = splitHours(rule[f.key]);
    out[f.name] = { value: String(value), unit };
  }
  return out;
}

function RuleRow({ row, scope }: { row: RuleRowData; scope: "branch" | "funder" }) {
  const [open, setOpen] = useState(scope === "branch" || row.rule != null);
  const [values, setValues] = useState(() => initialValues(row.rule ?? DEFAULT_CANCEL_RULE));
  const s = useRowSave();

  function save() {
    const fd = new FormData();
    fd.set("scope", scope);
    fd.set("scope_id", row.scopeId);
    for (const [name, v] of Object.entries(values)) {
      fd.set(`${name}_value`, v.value);
      fd.set(`${name}_unit`, v.unit);
    }
    s.run(saveCancelRuleAction, fd);
  }

  const summary = row.rule
    ? `Notice ${durationWords(row.rule.noticeHours)}, charged ${durationWords(row.rule.chargeHours)}, carer paid ${durationWords(row.rule.payHours)}`
    : scope === "branch"
      ? `The starting default: notice ${durationWords(DEFAULT_CANCEL_RULE.noticeHours)}, charged ${durationWords(DEFAULT_CANCEL_RULE.chargeHours)}, carer paid ${durationWords(DEFAULT_CANCEL_RULE.payHours)}`
      : "Uses each branch's default";

  return (
    <li className={`space-y-3 rounded-xl border border-white/10 px-3 py-3 ${row.archived ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {row.name}
            {row.archived ? <span className="pill pill-neutral ml-2">Archived funder</span> : null}
          </p>
          <p className="text-xs text-white/55">{summary}</p>
        </div>
        {scope === "funder" && !open ? (
          <button type="button" className="btn-outline text-xs" onClick={() => setOpen(true)}>
            Set a rule
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <RuleFields
            values={values}
            disabled={s.pending}
            onChange={(name, v) => {
              setValues((prev) => ({ ...prev, [name]: v }));
              s.touched();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={s.pending} className={s.saved ? "btn-saved text-xs" : "btn-primary text-xs"}>
              {s.pending ? "Saving…" : s.saved ? "Saved" : "Save rule"}
            </button>
            {scope === "funder" && row.rule ? (
              <ActionForm
                action={clearFunderRuleAction}
                hidden={{ scope_id: row.scopeId }}
                label="Use each branch's default"
                savingLabel="Removing…"
                savedLabel="Removed"
                buttonClassName="btn-outline text-xs"
                confirm={`Remove ${row.name}'s own rule? Its service users then follow each branch's default.`}
              />
            ) : scope === "funder" ? (
              <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>
                Cancel
              </button>
            ) : null}
            {s.error ? <span className="text-xs text-red-300">{s.error}</span> : null}
          </div>
        </>
      ) : null}
    </li>
  );
}

export default function CancellationSettings({
  reasons,
  branches,
  funders,
  error,
}: {
  reasons: CancelReason[];
  branches: RuleRowData[];
  funders: RuleRowData[];
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-300">These settings could not all be read: {error}</p> : null}

      <section className="glass-card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-white">Cancellation reasons</h2>
          <p className="text-sm text-white/60">
            The reasons the office picks from when it cancels visits, A to Z with Other last. Tick
            whether a cancellation for that reason, made at short notice, is still charged and whether
            the carer is still paid.
          </p>
        </div>
        <ul className="space-y-2">
          {reasons.map((r) => (
            <ReasonRow key={`${r.id}-${r.archivedAt ? "a" : "l"}`} r={r} />
          ))}
        </ul>
        <ActionForm action={addCancelReasonAction} label="Add reason" savingLabel="Adding…" savedLabel="Added" className="space-y-2 border-t border-white/10 pt-4">
          <label htmlFor="new_reason" className="form-label">New reason</label>
          <input id="new_reason" name="label" maxLength={80} required placeholder="For example, Service user moved away" />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-white/80">
              <input type="checkbox" name="chargeable" /> Charged if short notice
            </label>
            <label className="flex items-center gap-2 text-xs text-white/80">
              <input type="checkbox" name="carer_paid" /> Carer paid if short notice
            </label>
          </div>
        </ActionForm>
      </section>

      <section className="glass-card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-white">Cancellation rules</h2>
          <p className="text-sm text-white/60">
            Notice needed: told later than this before the first cancelled visit is short notice.
            Still charged for and carer still paid for: how long after that short notice the visits
            are still charged and paid, where the reason allows it. A funder&apos;s own rule wins over
            the branch default.
          </p>
        </div>
        <h3 className="text-sm font-semibold text-white/85">Branch defaults</h3>
        {branches.length === 0 ? (
          <p className="text-sm text-white/55">No branches yet.</p>
        ) : (
          <ul className="space-y-2">
            {branches.map((b) => (
              <RuleRow key={b.scopeId} row={b} scope="branch" />
            ))}
          </ul>
        )}
        <h3 className="pt-2 text-sm font-semibold text-white/85">Funders</h3>
        {funders.length === 0 ? (
          <p className="text-sm text-white/55">
            No funders yet. Add councils and health boards in Settings, Service users, Funders, then give any that work differently a rule here.
          </p>
        ) : (
          <ul className="space-y-2">
            {funders.map((f) => (
              <RuleRow key={f.scopeId} row={f} scope="funder" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
