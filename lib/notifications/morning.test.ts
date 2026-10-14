import test from "node:test";
import assert from "node:assert/strict";
import { MORNING_EMAILS, choicesFrom, isMorningEmailKey, wantsMorningEmail } from "./morning.ts";

test("the four morning emails, in the order the grid shows them, each saying what is in it", () => {
  assert.deepEqual(MORNING_EMAILS.map((m) => m.key), ["branch_digest", "people_report", "service_user_report", "briefings_overdue"]);
  for (const m of MORNING_EMAILS) {
    assert.ok(m.whatsInIt.length > 10);
    assert.doesNotMatch(m.whatsInIt + m.name, / [-–—] /);
  }
  assert.equal(isMorningEmailKey("people_report"), true);
  assert.equal(isMorningEmailKey("sms_overdue"), false);
});

test("choices: only what is ticked; nobody listed gets nothing", () => {
  const c = choicesFrom([
    { profile_id: "a", email_key: "branch_digest", receive: true },
    { profile_id: "a", email_key: "people_report", receive: false },
    { profile_id: "b", email_key: "people_report", receive: true },
  ]);
  assert.equal(wantsMorningEmail(c, "a", "branch_digest"), true);
  assert.equal(wantsMorningEmail(c, "a", "people_report"), false);
  assert.equal(wantsMorningEmail(c, "b", "people_report"), true);
  assert.equal(wantsMorningEmail(c, "z", "people_report"), false);
});
