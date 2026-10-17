/**
 * Be Care Compliant: the Settings, Rota options, the pure half (Rota and Visits Stage 7b part 2a,
 * Phil's popup 2026-10-17; docs/decisions/rota-visits.md, Stage 7b decision 14). Importless, so
 * node --test runs it. The bounds match the checks on rota_settings (0509); a company that has saved
 * nothing uses the defaults, which are the timings agreed in Stages 3, 5, 6 and 7.
 */

export type RotaSettings = {
  lateAfterMin: number;
  missedAfterEndMin: number;
  overrunAfterEndMin: number;
  clockOpensMin: number;
  defaultRadiusM: number;
  notesEarlierHours: number;
  notesPinnedHours: number;
  lowStockDays: number;
};

export const DEFAULT_ROTA_SETTINGS: RotaSettings = {
  lateAfterMin: 15,
  missedAfterEndMin: 30,
  overrunAfterEndMin: 15,
  clockOpensMin: 30,
  defaultRadiusM: 200,
  notesEarlierHours: 24,
  notesPinnedHours: 48,
  lowStockDays: 7,
};

export type RotaSettingField = {
  key: keyof RotaSettings;
  column: string;
  group: "Alerts" | "Clock in" | "Notes and MAR";
  label: string;
  unit: string;
  min: number;
  max: number;
  hint: string;
};

/** The page's fields, in the order they show, with the database column each saves to. */
export const ROTA_SETTING_FIELDS: readonly RotaSettingField[] = [
  { key: "lateAfterMin", column: "late_after_min", group: "Alerts", label: "Late after", unit: "minutes after the start", min: 5, max: 120, hint: "A visit with a carer not clocked in by then raises a Visit late alert." },
  { key: "missedAfterEndMin", column: "missed_after_end_min", group: "Alerts", label: "Missed after", unit: "minutes after the end", min: 0, max: 240, hint: "A visit with no clock in at all by then raises a Visit missed alert." },
  { key: "overrunAfterEndMin", column: "overrun_after_end_min", group: "Alerts", label: "Overrunning after", unit: "minutes after the end", min: 5, max: 120, hint: "Shown on the Today tab when a carer is still clocked in." },
  { key: "clockOpensMin", column: "clock_opens_min", group: "Clock in", label: "Clock in opens", unit: "minutes before the start", min: 0, max: 120, hint: "Before then the carer's phone shows when Clock in will open." },
  { key: "defaultRadiusM", column: "default_radius_m", group: "Clock in", label: "Home radius for new homes", unit: "metres", min: 25, max: 2000, hint: "How close a clock in must be. Homes already set keep their own radius; change one on the service user's Clock in page." },
  { key: "notesEarlierHours", column: "notes_earlier_hours", group: "Notes and MAR", label: "Earlier notes shown for", unit: "hours", min: 1, max: 168, hint: "How far back a carer sees other carers' notes for the service user." },
  { key: "notesPinnedHours", column: "notes_pinned_hours", group: "Notes and MAR", label: "Pinned notes stay for", unit: "hours", min: 1, max: 168, hint: "A note ticked Pin Note stays at the top of the next visits for this long." },
  { key: "lowStockDays", column: "low_stock_days", group: "Notes and MAR", label: "Low stock warning", unit: "days of stock left", min: 1, max: 60, hint: "The MAR shows order more when a medicine has fewer days left than this." },
];

/** A database row (or nothing) as settings, the defaults filling any gap. */
export function rotaSettingsFromRow(row: Record<string, unknown> | null | undefined): RotaSettings {
  const out = { ...DEFAULT_ROTA_SETTINGS };
  if (!row) return out;
  for (const f of ROTA_SETTING_FIELDS) {
    const v = row[f.column];
    if (typeof v === "number" && Number.isInteger(v)) out[f.key] = v;
  }
  return out;
}

/** Checks the posted values: whole numbers inside each field's bounds. */
export function parseRotaSettings(get: (name: string) => unknown): { values: RotaSettings } | { error: string } {
  const values = { ...DEFAULT_ROTA_SETTINGS };
  for (const f of ROTA_SETTING_FIELDS) {
    const raw = String(get(f.column) ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < f.min || n > f.max) {
      return { error: `${f.label}: enter a whole number from ${f.min.toLocaleString("en-GB")} to ${f.max.toLocaleString("en-GB")} ${f.unit}.` };
    }
    values[f.key] = n;
  }
  return { values };
}

/** The row to save, keyed by database column. */
export function rotaSettingsRow(s: RotaSettings): Record<string, number> {
  const row: Record<string, number> = {};
  for (const f of ROTA_SETTING_FIELDS) row[f.column] = s[f.key];
  return row;
}
