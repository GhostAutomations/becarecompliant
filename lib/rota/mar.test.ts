import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOT_AVAILABLE_REASONS,
  REFUSED_REASONS,
  dayWords,
  daysOfStock,
  doseProblem,
  doseReasonLabel,
  dueAt,
  nhsNumberShown,
  nhsNumberValid,
  slotWords,
} from "./mar.ts";

const med = { prn: false, slots: ["morning", "night"], days: null, start_date: "2026-10-01", stop_date: null, dose_quantity: 2 };

test("the reasons are the ones the database accepts, A to Z with Other last", () => {
  assert.deepEqual(REFUSED_REASONS.map((r) => r.code).sort(), ["asleep", "declined", "nil_by_mouth", "other", "spat_out", "unwell"]);
  assert.deepEqual(NOT_AVAILABLE_REASONS.map((r) => r.code).sort(), ["given_by_family", "given_by_professional", "in_hospital", "not_at_home", "not_delivered", "other", "out_of_stock"]);
  for (const list of [REFUSED_REASONS, NOT_AVAILABLE_REASONS]) {
    assert.equal(list[list.length - 1].code, "other");
    const labels = list.slice(0, -1).map((r) => r.label);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en-GB")));
  }
  assert.equal(doseReasonLabel("out_of_stock"), "None left");
  assert.equal(doseReasonLabel("other", "Bottle broke"), "Bottle broke");
});

test("a dose not given needs a fitting reason; Other needs words; a when required dose needs a quantity", () => {
  assert.equal(doseProblem({ outcome: "given", reason: null, text: "", quantity: null, prn: false }), null);
  assert.equal(doseProblem({ outcome: "given", reason: null, text: "", quantity: null, prn: true }), "Enter how many were given.");
  assert.equal(doseProblem({ outcome: "refused", reason: null, text: "", quantity: null, prn: false }), "Pick a reason.");
  assert.equal(doseProblem({ outcome: "refused", reason: "out_of_stock", text: "", quantity: null, prn: false }), "Pick a reason.");
  assert.equal(doseProblem({ outcome: "not_available", reason: "out_of_stock", text: "", quantity: null, prn: false }), null);
  assert.equal(doseProblem({ outcome: "refused", reason: "other", text: " ", quantity: null, prn: false }), "Type the reason.");
  assert.equal(doseProblem({ outcome: "other", reason: null, text: "", quantity: null, prn: false }), "Type the reason.");
});

test("due at a visit: the call, the days, the start and stop dates; when required is never due", () => {
  assert.equal(dueAt(med, "2026-10-16", "morning"), true);
  assert.equal(dueAt(med, "2026-10-16", "lunch"), false);
  assert.equal(dueAt(med, "2026-09-30", "morning"), false);
  assert.equal(dueAt({ ...med, stop_date: "2026-10-15" }, "2026-10-16", "morning"), false);
  // Friday 16 Oct 2026 is day 4 (0 Monday)
  assert.equal(dueAt({ ...med, days: [0, 4] }, "2026-10-16", "morning"), true);
  assert.equal(dueAt({ ...med, days: [0] }, "2026-10-16", "morning"), false);
  assert.equal(dueAt({ ...med, prn: true }, "2026-10-16", "morning"), false);
});

test("days of stock: regular doses only, rounded down; unknown when it cannot be said", () => {
  // 2 a dose, twice a day: 4 a day; 26 left is 6 days
  assert.equal(daysOfStock(med, 26), 6);
  assert.equal(daysOfStock(med, 28), 7);
  // twice a week on Mon and Fri, morning only: 4 a week; 8 left is 14 days
  assert.equal(daysOfStock({ ...med, slots: ["morning"], days: [0, 4] }, 8), 14);
  assert.equal(daysOfStock({ ...med, prn: true }, 10), null);
  assert.equal(daysOfStock({ ...med, dose_quantity: null }, 10), null);
  assert.equal(daysOfStock(med, null), null);
});

test("words for the calls and the days", () => {
  assert.equal(slotWords(["night", "morning"]), "Morning and Night");
  assert.equal(slotWords(["morning", "lunch", "night"]), "Morning, Lunch and Night");
  assert.equal(dayWords(null), "Every day");
  assert.equal(dayWords([4, 0]), "Mon and Fri");
});

test("NHS numbers: Modulus 11 check digit, spaces ignored, shown 3 3 4", () => {
  assert.equal(nhsNumberValid("943 476 5919"), true); // NHS Digital's published test number
  assert.equal(nhsNumberValid("9434765918"), false);
  assert.equal(nhsNumberValid("123"), false);
  assert.equal(nhsNumberShown("9434765919"), "943 476 5919");
});

test("the phone shows a newer dose waiting to send, never another sign in's or a refused one", async () => {
  const { mergeDoses } = await import("./mar.ts");
  const med = {
    med_uid: "m1", medicine_id: "v1", name: "Paracetamol 500mg tablets", form: "Tablet", route: "Oral", dose_text: "Take TWO tablets",
    dose_quantity: 2, dose_unit: "tablet", support: "give" as const, prn: false, time_sensitive: false, instructions: null, waiting: false,
    last_given: { at: "2026-10-16T08:00:00+00:00", quantity: 2 },
    recorded: null,
  };
  const server = { visit_id: "vis", competent: true, allergies: null, meds: [med] };
  const ev = (over: object) => ({
    event_id: "e1", owner: "me", visit_id: "vis", med_uid: "m1", medicine_id: "v1", outcome: "given" as const, reason_code: null,
    reason_text: null, quantity: null, phone_time: "2026-10-16T12:00:00.000Z", ...over,
  });
  const shown = mergeDoses(server, [ev({})], "vis", "me")[0];
  assert.equal(shown.recorded?.outcome, "given");
  assert.equal(shown.waitingSend, true);
  assert.equal(shown.last_given?.at, "2026-10-16T12:00:00.000Z");
  assert.equal(shown.last_given?.quantity, 2); // the dose quantity when none was typed
  assert.equal(mergeDoses(server, [ev({ owner: "someone" })], "vis", "me")[0].recorded, null);
  assert.equal(mergeDoses(server, [ev({ refused: "No" })], "vis", "me")[0].recorded, null);
  assert.equal(mergeDoses(server, [ev({ visit_id: "other" })], "vis", "me")[0].recorded, null);
  // a refused dose waiting does not move "last given"
  assert.equal(mergeDoses(server, [ev({ outcome: "refused", reason_code: "declined" })], "vis", "me")[0].last_given?.at, "2026-10-16T08:00:00+00:00");
});

test("NHS list search: the exact name first, then names starting with it, combinations last", async () => {
  const { rankDmdHits } = await import("./mar.ts");
  const hits = [
    "Paracetamol 500mg / Caffeine 65mg tablets",
    "Paracetamol 500mg soluble tablets",
    "Paracetamol 500mg tablets",
    "Paracetamol 500mg / Domperidone 10mg tablets",
  ].map((name) => ({ name }));
  assert.deepEqual(rankDmdHits(hits, "paracetamol 500mg tablets").map((h) => h.name), [
    "Paracetamol 500mg tablets",
    "Paracetamol 500mg soluble tablets",
    "Paracetamol 500mg / Caffeine 65mg tablets",
    "Paracetamol 500mg / Domperidone 10mg tablets",
  ]);
  assert.equal(rankDmdHits(hits, "paracetamol")[0].name, "Paracetamol 500mg tablets");
});
