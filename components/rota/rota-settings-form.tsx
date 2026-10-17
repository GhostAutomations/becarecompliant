"use client";

/**
 * Be Care Compliant: the Settings, Rota options form (Stage 7b part 2a, decision 14). One number per
 * option, grouped as Phil listed them: alerts, clock in, notes and MAR. Location stays required and
 * is not offered here.
 */

import ActionForm from "@/components/action-form";
import { saveRotaSettingsAction } from "@/lib/rota/settings-actions";
import { DEFAULT_ROTA_SETTINGS, ROTA_SETTING_FIELDS, type RotaSettings } from "@/lib/rota/settings-rules";

const GROUPS = ["Alerts", "Clock in", "Notes and MAR"] as const;

export default function RotaSettingsForm({ settings }: { settings: RotaSettings }) {
  return (
    <ActionForm action={saveRotaSettingsAction} label="Save Rota settings" className="space-y-5">
      {GROUPS.map((g) => (
        <fieldset key={g} className="space-y-3">
          <legend className="text-sm font-semibold text-white/85">{g}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {ROTA_SETTING_FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key}>
                <label htmlFor={`rs_${f.column}`} className="form-label">
                  {f.label} <span className="font-normal text-white/50">({f.unit})</span>
                </label>
                <input
                  id={`rs_${f.column}`}
                  name={f.column}
                  type="number"
                  inputMode="numeric"
                  min={f.min}
                  max={f.max}
                  step={1}
                  required
                  defaultValue={settings[f.key]}
                />
                <p className="form-hint">
                  {f.hint} Default {DEFAULT_ROTA_SETTINGS[f.key].toLocaleString("en-GB")}.
                </p>
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="form-hint">Location is always required to clock in or out; that is not a setting.</p>
    </ActionForm>
  );
}
