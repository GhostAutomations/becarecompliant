"use client";

/**
 * Be Care Compliant — Settings > Absence editor (Company Admin).
 * Choose the tracking method (stages | Bradford), the rolling window and the
 * thresholds; upload the policy; and let AI suggest the settings from it. AI is
 * opt-in and only pre-fills the form — nothing is saved until Save is pressed.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  DEFAULT_STAGE_THRESHOLDS,
  DEFAULT_BRADFORD_BANDS,
  type AbsenceMethod,
  type BradfordBand,
  type StageThreshold,
} from "@/lib/absence/logic";
import {
  saveAbsenceConfig,
  uploadAbsencePolicy,
  suggestAbsencePolicy,
} from "@/lib/absence/settings-actions";

type Row = Record<string, string | number>;

export default function AbsenceSettings({
  initialMethod,
  initialWindow,
  initialThresholds,
  policyUploadedAt,
  policyAiSummary,
}: {
  initialMethod: AbsenceMethod;
  initialWindow: number;
  initialThresholds: StageThreshold[] | BradfordBand[];
  policyUploadedAt: string | null;
  policyAiSummary: string | null;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<AbsenceMethod>(initialMethod);
  const [windowDays, setWindowDays] = useState(String(initialWindow));
  const [rows, setRows] = useState<Row[]>(initialThresholds as unknown as Row[]);
  const [summary, setSummary] = useState<string | null>(policyAiSummary);

  const [saveState, saveAction, saving] = useActionState(saveAbsenceConfig, IDLE_STATE);
  const [uploadState, uploadAction] = useActionState(uploadAbsencePolicy, IDLE_STATE);
  const [aiState, aiAction, aiPending] = useActionState(suggestAbsencePolicy, IDLE_STATE);

  // When AI returns a suggestion (JSON in ok), pre-fill the form for review.
  useEffect(() => {
    if (!aiState.ok || !aiState.ok.startsWith("{")) return;
    try {
      const s = JSON.parse(aiState.ok) as {
        method?: string;
        rolling_window_days?: number;
        thresholds?: Row[];
        summary?: string;
      };
      if (s.method === "stages" || s.method === "bradford") setMethod(s.method);
      if (s.rolling_window_days) setWindowDays(String(s.rolling_window_days));
      if (Array.isArray(s.thresholds)) setRows(s.thresholds);
      if (s.summary) setSummary(s.summary);
    } catch {
      /* ignore parse issues; the action already surfaced errors */
    }
  }, [aiState]);

  useEffect(() => {
    if (uploadState.ok) router.refresh();
  }, [uploadState.ok, router]);

  function switchMethod(next: AbsenceMethod) {
    setMethod(next);
    setRows(
      (next === "bradford" ? DEFAULT_BRADFORD_BANDS : DEFAULT_STAGE_THRESHOLDS) as unknown as Row[],
    );
  }

  function updateCell(i: number, key: string, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      method === "bradford"
        ? { threshold: 0, label: "", action: "" }
        : { stage: prev.length + 1, label: "", occasions: 0, days: 0 },
    ]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSave() {
    const numericKeys = method === "bradford" ? ["threshold"] : ["stage", "occasions", "days"];
    const cleaned = rows.map((r) => {
      const out: Row = { ...r };
      for (const k of numericKeys) {
        if (k in out) out[k] = Number(out[k]) || 0;
      }
      return out;
    });
    const fd = new FormData();
    fd.set("method", method);
    fd.set("rolling_window_days", windowDays);
    fd.set("thresholds", JSON.stringify(cleaned));
    saveAction(fd);
  }

  const stageCols =
    method === "bradford"
      ? [
          { key: "threshold", label: "Score reaches", type: "number" },
          { key: "label", label: "Stage label", type: "text" },
          { key: "action", label: "Action", type: "text" },
        ]
      : [
          { key: "stage", label: "Stage", type: "number" },
          { key: "label", label: "Label", type: "text" },
          { key: "occasions", label: "Occasions", type: "number" },
          { key: "days", label: "Days", type: "text" },
        ];

  return (
    <div className="space-y-6">
      {/* Method + thresholds */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Tracking method</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="radio"
              name="method"
              checked={method === "stages"}
              onChange={() => switchMethod("stages")}
            />
            Trigger points (stages)
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="radio"
              name="method"
              checked={method === "bradford"}
              onChange={() => switchMethod("bradford")}
            />
            Bradford Factor
          </label>
        </div>

        <div className="mt-4 max-w-xs">
          <label htmlFor="window" className="form-label">
            Rolling window (days)
          </label>
          <input
            id="window"
            type="number"
            min={1}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
          />
        </div>

        <div className="mt-4">
          <p className="form-label">Thresholds</p>
          <p className="mb-2 text-xs text-white/50">
            {method === "bradford"
              ? "A stage triggers when the Bradford score (occasions squared times days) reaches the value."
              : "A stage triggers when occasions OR days reach the values, within the rolling window."}
          </p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                {stageCols.map((c) => (
                  <div key={c.key} className="min-w-[90px] flex-1">
                    <label className="form-label text-[11px]">{c.label}</label>
                    <input
                      type={c.type}
                      value={String(r[c.key] ?? "")}
                      onChange={(e) => updateCell(i, c.key, e.target.value)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="btn-ghost px-2 py-2 text-xs text-red-300"
                  aria-label="Remove threshold"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="btn-outline mt-2 px-3 py-1.5 text-xs">
            Add threshold
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary px-4 py-2 text-sm">
            {saving ? "Saving…" : "Save"}
          </button>
          {saveState.ok && !saving && (
            <span className="text-xs text-emerald-300">{saveState.ok}</span>
          )}
          {saveState.error && <span className="form-error mt-0 text-xs">{saveState.error}</span>}
        </div>
      </section>

      {/* Policy upload + AI */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Company absence policy</h2>
        <p className="mt-1 text-xs text-white/50">
          {policyUploadedAt
            ? `A policy was uploaded on ${policyUploadedAt.slice(0, 10)}.`
            : "No policy uploaded yet."}
        </p>

        <form action={uploadAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="policy" className="form-label">
              Upload policy (PDF)
            </label>
            <input id="policy" name="policy" type="file" accept="application/pdf" />
          </div>
          <button type="submit" className="btn-outline px-3 py-2 text-sm">
            Upload
          </button>
          {uploadState.ok && <span className="text-xs text-emerald-300">{uploadState.ok}</span>}
          {uploadState.error && <span className="form-error mt-0 text-xs">{uploadState.error}</span>}
        </form>

        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => aiAction(new FormData())}
            disabled={aiPending}
            className="btn-outline px-3 py-2 text-sm"
          >
            {aiPending ? "Reading policy…" : "Suggest settings with AI"}
          </button>
          {aiState.error && <p className="form-error text-xs">{aiState.error}</p>}
          {summary && (
            <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-white/70">
              AI summary: {summary} Review the method and thresholds above, then Save.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
