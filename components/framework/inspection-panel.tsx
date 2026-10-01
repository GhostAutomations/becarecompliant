"use client";

/**
 * A branch's last inspection by the regulator, with the rating it gave each theme (0363, Phil
 * 2026-10-01). Recorded by hand from the published report, e.g. CIW's report for Thistle Care
 * (Cardiff). Shown beside BCC's own live status, which is a preparation aid, not a rating.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { recordBranchInspection } from "@/lib/framework/inspection-actions";
import { RATING_LEVELS, ratingLabel, ratingTone, type Regulator } from "@/lib/framework/ratings";

const TONE_PILL = { green: "pill-green", amber: "pill-amber", red: "pill-red" } as const;

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type InspectionView = {
  inspectedOn: string;
  publishedOn: string | null;
  ratings: Record<string, string>;
  notes: string | null;
};

export default function InspectionPanel({
  regulator,
  branchId,
  branchName,
  themes,
  last,
  canRecord,
}: {
  regulator: Regulator;
  branchId: string;
  branchName: string;
  themes: Array<{ code: string; title: string }>;
  last: InspectionView | null;
  canRecord: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const reg = regulator.toUpperCase();
  const rated = last ? themes.filter((t) => last.ratings[t.code]) : [];

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Last {reg} inspection of {branchName}</h2>
          {last ? (
            <p className="mt-0.5 text-sm text-white/60">
              Inspected {fmt(last.inspectedOn)}
              {last.publishedOn ? `, report published ${fmt(last.publishedOn)}` : ""}.
              {rated.length === 0 ? " No ratings recorded for it." : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-white/60">
              No inspection recorded yet. Add the date and the rating {reg} gave each theme from the published report.
            </p>
          )}
        </div>
        {canRecord && !adding ? (
          <button type="button" className="btn-outline text-sm" onClick={() => setAdding(true)}>
            Record an inspection
          </button>
        ) : null}
      </div>

      {rated.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {rated.map((t) => {
            const v = last!.ratings[t.code];
            const tone = ratingTone(regulator, v);
            return (
              <span key={t.code} className={`pill ${tone ? TONE_PILL[tone] : "pill-neutral"}`}>
                {t.title}: {ratingLabel(regulator, v)}
              </span>
            );
          })}
        </div>
      ) : null}
      {last?.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-white/70">{last.notes}</p> : null}

      {adding ? (
        <ActionForm
          action={recordBranchInspection}
          hidden={{ branch_id: branchId }}
          label="Save inspection"
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        >
          <div>
            <label htmlFor="bi_inspected" className="form-label">Date inspection completed *</label>
            <input id="bi_inspected" name="inspected_on" type="date" required />
          </div>
          <div>
            <label htmlFor="bi_published" className="form-label">Date report published</label>
            <input id="bi_published" name="published_on" type="date" />
          </div>
          {themes.map((t) => (
            <div key={t.code}>
              <label htmlFor={`bi_${t.code}`} className="form-label">{t.title}</label>
              <select id={`bi_${t.code}`} name={`rating_${t.code}`} defaultValue="">
                <option value="">Not rated</option>
                {RATING_LEVELS[regulator].map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor="bi_notes" className="form-label">Notes</label>
            <textarea id="bi_notes" name="notes" rows={2} maxLength={2000} placeholder="For example, the inspector's summary, or what was found." />
            <p className="form-hint">
              Reports before April 2025 have no ratings, so leave the themes as Not rated for those.
            </p>
          </div>
          <div className="sm:col-span-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}
