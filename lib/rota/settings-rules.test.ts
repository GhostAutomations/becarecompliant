import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROTA_SETTINGS, ROTA_SETTING_FIELDS, parseRotaSettings, rotaSettingsFromRow, rotaSettingsRow } from "./settings-rules.ts";

const posted = (over: Record<string, string> = {}) => {
  const base = rotaSettingsRow(DEFAULT_ROTA_SETTINGS);
  const all: Record<string, string> = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)]));
  Object.assign(all, over);
  return (name: string) => all[name];
};

test("defaults are the timings agreed in Stages 3 to 7", () => {
  assert.deepEqual(DEFAULT_ROTA_SETTINGS, {
    lateAfterMin: 15, missedAfterEndMin: 30, overrunAfterEndMin: 15, clockOpensMin: 30,
    defaultRadiusM: 200, notesEarlierHours: 24, notesPinnedHours: 48, lowStockDays: 7,
  });
  for (const f of ROTA_SETTING_FIELDS) {
    const d = DEFAULT_ROTA_SETTINGS[f.key];
    assert.ok(d >= f.min && d <= f.max, f.key);
  }
});

test("a missing or partial row falls back to the defaults", () => {
  assert.deepEqual(rotaSettingsFromRow(null), DEFAULT_ROTA_SETTINGS);
  assert.equal(rotaSettingsFromRow({ late_after_min: 5 }).lateAfterMin, 5);
  assert.equal(rotaSettingsFromRow({ late_after_min: 5 }).missedAfterEndMin, 30);
  assert.equal(rotaSettingsFromRow({ late_after_min: "x" }).lateAfterMin, 15);
});

test("posted values: whole numbers inside the bounds only", () => {
  const ok = parseRotaSettings(posted({ late_after_min: "10", missed_after_end_min: "0" }));
  assert.ok("values" in ok);
  if ("values" in ok) {
    assert.equal(ok.values.lateAfterMin, 10);
    assert.equal(ok.values.missedAfterEndMin, 0);
  }
  for (const [k, v] of [["late_after_min", "4"], ["late_after_min", "121"], ["clock_opens_min", "7.5"], ["default_radius_m", ""], ["low_stock_days", "abc"]]) {
    const r = parseRotaSettings(posted({ [k]: v }));
    assert.ok("error" in r, `${k}=${v}`);
  }
  const e = parseRotaSettings(posted({ default_radius_m: "3000" }));
  assert.ok("error" in e && e.error.includes("25 to 2,000 metres"));
});

test("the row round trips", () => {
  const s = { ...DEFAULT_ROTA_SETTINGS, lateAfterMin: 20, lowStockDays: 10 };
  assert.deepEqual(rotaSettingsFromRow(rotaSettingsRow(s)), s);
});
