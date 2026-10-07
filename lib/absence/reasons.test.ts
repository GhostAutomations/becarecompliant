import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import { absenceReasonText } from "./reasons.ts";

test("several reasons, each with its details", () => {
  assert.equal(
    absenceReasonText({
      reasons: ["Headache or migraine", "Cold or flu"],
      reason_detail_cold_flu: "Temperature since Sunday",
      reason_detail_headache_migraine: "Migraine",
    }),
    "Cold or flu (Temperature since Sunday); Headache or migraine (Migraine)",
  );
});

test("sickness and diarrhoea, stopped: the last episode is kept", () => {
  assert.equal(
    absenceReasonText({
      reasons: ["Sickness and diarrhoea"],
      dv_still_symptoms: "No",
      dv_last_episode_date: "2026-10-05",
      dv_last_episode_time: "14:30",
      further_information: "Will call tomorrow",
    }),
    "Sickness and diarrhoea (last episode 05/10/2026 at 14:30); Further information: Will call tomorrow",
  );
});

test("sickness and diarrhoea, still going", () => {
  assert.equal(
    absenceReasonText({ reasons: ["Sickness and diarrhoea"], dv_still_symptoms: "Yes" }),
    "Sickness and diarrhoea (still having symptoms)",
  );
});

test("a form saved before the change keeps its one reason box", () => {
  assert.equal(absenceReasonText({ reason: "Unwell" }), "Unwell");
  assert.equal(absenceReasonText({}), null);
});
