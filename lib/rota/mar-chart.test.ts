import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarChart, chartCell, initials, monthDays, type ChartMed, type MarChartInput } from "./mar-chart.ts";

const med: ChartMed = {
  medUid: "m1", name: "Ramipril 5mg capsules", doseText: "Take ONE capsule each morning", doseQuantity: 1, doseUnit: "capsule", support: "give",
  prn: false, slots: ["morning"], days: null, route: "Oral", timeSensitive: false, instructions: null, startDate: "2026-10-01", stopDate: null,
  status: "live", stoppedAt: null, stopReason: null, checkedByName: "A Supervisor",
};
const prn: ChartMed = { ...med, medUid: "m2", name: "Paracetamol 500mg tablets", doseText: "ONE or TWO tablets up to four times a day", doseUnit: "tablet", prn: true, slots: [] };
const input: MarChartInput = {
  companyName: "Test Care Ltd", branchName: "Swansea", serviceUserName: "A Service User", ssid: "SU1", dateOfBirth: "1940-02-29",
  nhsNumber: "9434765919", gpPractice: "A Surgery", allergies: null, month: "2026-10", today: "2026-10-17", madeAt: "2026-10-17T10:00:00Z",
  meds: [med, prn],
  visits: [
    { id: "v15", date: "2026-10-15", slot: "morning", clockedOut: true },
    { id: "v16", date: "2026-10-16", slot: "morning", clockedOut: true },
    { id: "v17", date: "2026-10-17", slot: "morning", clockedOut: false },
  ],
  doses: [
    { visitId: "v15", medUid: "m1", author: "Gethin Carer", slot: "morning", outcome: "given", reasonCode: null, reasonText: null, quantity: null, at: "2026-10-15T07:30:00Z" },
    { visitId: "v16", medUid: "m1", author: "Gethin Carer", slot: "morning", outcome: "refused", reasonCode: "declined", reasonText: null, quantity: null, at: "2026-10-16T07:30:00Z" },
    { visitId: "v16", medUid: "m2", author: "Gethin Carer", slot: "", outcome: "given", reasonCode: null, reasonText: null, quantity: 2, at: "2026-10-16T07:35:00Z" },
  ],
};

test("month days: 31 in October, 29 in a leap February", () => {
  assert.equal(monthDays("2026-10").length, 31);
  assert.equal(monthDays("2028-02").length, 29);
  assert.equal(monthDays("2026-02").length, 28);
});

test("initials", () => {
  assert.equal(initials("Gethin Carer"), "GC");
  assert.equal(initials("Ann Marie Jones"), "AJ");
  assert.equal(initials("Cher"), "CH");
});

test("cells: initials when given, a code when not, X when due and not recorded, a box when due later, blank when not due", () => {
  assert.deepEqual(chartCell(med, "2026-10-15", "morning", input), { text: "GC", rag: "green" });
  assert.equal(chartCell(med, "2026-10-16", "morning", input).text, "R");
  // no visit and no dose in the past: X
  assert.equal(chartCell(med, "2026-10-14", "morning", input).text, "X");
  assert.equal(chartCell(med, "2026-10-14", "morning", input).rag, "red");
  // today, not clocked out yet: an empty box to write in
  assert.equal(chartCell(med, "2026-10-17", "morning", input).rag, "neutral");
  assert.equal(chartCell(med, "2026-10-17", "morning", input).text.trim(), "");
  // before the start: not due
  assert.equal(chartCell({ ...med, startDate: "2026-10-16" }, "2026-10-15", "morning", input).text, "");
  // a stopped medicine is not due after the day it stopped
  assert.equal(chartCell({ ...med, status: "stopped", stoppedAt: "2026-10-12T15:00:00Z" }, "2026-10-14", "morning", input).text, "");
  // on the day it stopped, with nothing recorded: blank, not X or a box
  assert.equal(chartCell({ ...med, status: "stopped", stoppedAt: "2026-10-12T15:00:00Z" }, "2026-10-12", "morning", input).text, "");
  // another call: not due
  assert.equal(chartCell(med, "2026-10-15", "night", input).text, "");
});

test("the chart: landscape, details at the top, two halves, the reasons and the when required log, no dashes", () => {
  const doc = buildMarChart(input);
  assert.equal(doc.landscape, true);
  assert.equal(doc.meta?.find((p) => p.label === "Allergies")?.value, "Not recorded");
  assert.equal(doc.meta?.find((p) => p.label === "NHS number")?.value, "943 476 5919");
  const headings = doc.blocks.filter((b) => b.kind === "heading").map((b) => (b as { text: string }).text);
  assert.deepEqual(headings, ["Medicines", "1 to 16 October 2026", "17 to 31 October 2026", "Doses not given", "When required doses"]);
  const tables = doc.blocks.filter((b) => b.kind === "table") as Array<{ columns: { header: string }[]; rows: { text: string }[][] }>;
  assert.equal(tables[1].columns.length, 17);
  assert.equal(tables[1].columns[1].header, "Th 1");
  assert.equal(tables[2].columns.length, 16);
  // one grid row: the regular medicine at its one call (the when required one is not on the grid)
  assert.equal(tables[1].rows.length, 1);
  assert.equal(tables[3].rows.length, 1);
  assert.match(tables[3].rows[0][3].text, /^Refused: /);
  assert.equal(tables[4].rows[0][3].text, "2 tablet");
  assert.ok(!/\s[-–—]\s/.test(JSON.stringify(doc)), "no dashes as punctuation");
});
