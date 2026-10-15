import test from "node:test";
import assert from "node:assert/strict";
import { MORNING_EMAILS, checkPart, choicesFrom, keepPart, reportPartsFor, wantsMorningEmail, type MorningRow } from "./morning.ts";

const rows = (pid: string, ticks: Record<string, boolean>): MorningRow[] =>
  Object.entries(ticks).map(([k, receive]) => {
    const [email_key, part] = k.split("|");
    return { profile_id: pid, email_key, part: part ?? "", receive };
  });

const company = (pid: string, overrides: Record<string, boolean>) =>
  rows(pid, {
    "branch_digest|": false,
    [`people_report|${checkPart("sup")}`]: true,
    [`people_report|${checkPart("app")}`]: true,
    "people_report|training": true,
    "people_report|scw": true,
    "people_report|dbs": true,
    "people_report|rtw": true,
    [`service_user_report|${checkPart("cpr")}`]: true,
    "briefings_overdue|": true,
    ...overrides,
  });

test("the morning emails each say what is in them, with no dashes", () => {
  assert.deepEqual(MORNING_EMAILS.map((m) => m.key), ["branch_digest", "people_report", "service_user_report", "briefings_overdue"]);
  for (const m of MORNING_EMAILS) assert.doesNotMatch(m.whatsInIt + m.name, / [-–—] /);
});

test("every part ticked: the report goes whole, nothing filtered (as it always did)", () => {
  const m = choicesFrom(company("admin", {}));
  const rp = reportPartsFor(m, "admin", "people_report");
  assert.ok(rp);
  assert.equal(rp!.all, true);
  assert.equal(keepPart(rp!, undefined), true);
  assert.equal(wantsMorningEmail(m, "admin", "people_report"), true);
  assert.equal(wantsMorningEmail(m, "admin", "branch_digest"), false);
});

test("Lucy: Training, DBS and Right to Work only", () => {
  const m = choicesFrom(
    company("lucy", {
      [`people_report|${checkPart("sup")}`]: false,
      [`people_report|${checkPart("app")}`]: false,
      "people_report|scw": false,
      [`service_user_report|${checkPart("cpr")}`]: false,
      "briefings_overdue|": false,
    }),
  );
  const rp = reportPartsFor(m, "lucy", "people_report")!;
  assert.equal(rp.all, false);
  assert.deepEqual([...rp.parts].sort(), ["dbs", "rtw", "training"]);
  assert.equal(keepPart(rp, "training"), true);
  assert.equal(keepPart(rp, checkPart("sup")), false);
  assert.equal(keepPart(rp, undefined), false);
  assert.equal(reportPartsFor(m, "lucy", "service_user_report"), null);
  assert.equal(wantsMorningEmail(m, "lucy", "service_user_report"), false);
  assert.equal(wantsMorningEmail(m, "lucy", "briefings_overdue"), false);
});

test("nobody listed gets nothing", () => {
  const m = choicesFrom(company("a", {}));
  assert.equal(wantsMorningEmail(m, "z", "people_report"), false);
  assert.equal(reportPartsFor(m, "z", "people_report"), null);
});
