import test from "node:test";
import assert from "node:assert/strict";
import { cycleCheckKey, cycleWord, ltlCycleDates, onOffice } from "./office-cycle.ts";
import { appraisalSlot } from "./appraisal-cycle.ts";
import { supervisionsConsumed } from "./supervision-cycle.ts";
import { addInterval, formatCivilDate, parseCivilDate } from "../recurrence.ts";

const TODAY = { year: 2026, month: 10, day: 14 };
const plus80 = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", 80));
const ticked = [{ started_at: "2026-10-14T09:00:00+00:00", ended_at: null }];

test("ticked means an open period", () => {
  assert.equal(onOffice([]), false);
  assert.equal(onOffice([{ started_at: "2026-01-01T00:00:00Z", ended_at: "2026-02-01T00:00:00Z" }]), false);
  assert.equal(onOffice(ticked), true);
  assert.equal(cycleWord(true), "LTL");
  assert.equal(cycleWord(false), "Supervision");
  assert.equal(cycleCheckKey(true), "lead_the_leader");
  assert.equal(cycleCheckKey(false), "supervision");
});

test("only LTLs recorded while ticked count, whatever date the form carries", () => {
  const ltl = [
    { date: "2026-03-01", submittedAt: "2026-03-01T10:00:00Z" }, // ad hoc, before ticking
    { date: "2026-10-10", submittedAt: "2026-10-15T10:00:00Z" }, // dated earlier, recorded while ticked
  ];
  assert.deepEqual(ltlCycleDates(ltl, ticked), ["2026-10-10"]);
  assert.deepEqual(ltlCycleDates(ltl, []), []);
});

test("an LTL recorded after unticking is ad hoc again", () => {
  const closed = [{ started_at: "2026-10-14T09:00:00Z", ended_at: "2026-11-01T09:00:00Z" }];
  const ltl = [
    { date: "2026-10-20", submittedAt: "2026-10-20T10:00:00Z" },
    { date: "2026-11-05", submittedAt: "2026-11-05T10:00:00Z" },
  ];
  assert.deepEqual(ltlCycleDates(ltl, closed), ["2026-10-20"]);
});

/*
 * CARRY ON FROM WHERE THEY ARE. Ticked with Supervision 1 and 2 done in this cycle: the cycle is
 * their supervisions, so the next is LTL 3, due one interval after Supervision 2, and nobody goes
 * overdue by being ticked.
 */
test("ticked after Supervision 2: LTL 3 is next, due 80 days after Supervision 2", () => {
  const sups = ["2025-06-01", "2025-08-20", "2025-11-08", "2026-06-01", "2026-08-20"];
  const apps = ["2026-03-10"];
  const cycle = [...sups, ...ltlCycleDates([], ticked)].sort();
  const current = cycle.slice(supervisionsConsumed(cycle, apps[0]));
  assert.equal(current.length, 2); // LTL 1 and LTL 2 done, LTL 3 next
  assert.equal(plus80(current[1]), "2026-11-08");
});

test("LTL 3 done while ticked: Annual Appraisal due 80 days later", () => {
  const sups = ["2026-06-01", "2026-08-20"];
  const apps = ["2026-03-10"];
  const ltl = ltlCycleDates([{ date: "2026-10-20", submittedAt: "2026-10-20T10:00:00Z" }], ticked);
  const cycle = [...sups, ...ltl].sort();
  const aa = appraisalSlot(apps, cycle, 80, 14, TODAY, "2026-10-20");
  assert.equal(aa.nextDue, plus80("2026-10-20"));
  assert.equal(aa.nextDue, "2027-01-08");
});

test("appraisal done while ticked: LTL 1 due 80 days after it, cycle restarts", () => {
  const cycle = ["2026-06-01", "2026-08-20", "2026-10-20"];
  const apps = ["2026-03-10", "2026-11-01"];
  const current = cycle.slice(supervisionsConsumed(cycle, apps[1]));
  assert.equal(current.length, 0);
  assert.equal(plus80(apps[1]), "2027-01-20");
});

test("unticked: their LTLs carry the supervision cycle on", () => {
  const sups = ["2026-06-01"];
  const closed = [{ started_at: "2026-07-01T09:00:00Z", ended_at: "2026-10-01T09:00:00Z" }];
  const ltl = ltlCycleDates([{ date: "2026-08-25", submittedAt: "2026-08-25T11:00:00Z" }], closed);
  const cycle = [...sups, ...ltl].sort();
  const current = cycle.slice(supervisionsConsumed(cycle, "2026-03-10"));
  assert.deepEqual(current, ["2026-06-01", "2026-08-25"]); // Supervision 3 next
  assert.equal(plus80(current[1]), "2026-11-13");
});

test("ticked straight after probation with no history: nothing done, LTL 1 next", () => {
  const cycle = [...[], ...ltlCycleDates([], ticked)];
  assert.equal(cycle.length, 0);
  assert.equal(plus80("2026-09-01"), "2026-11-20"); // probation end + interval
});

test("the tick: only a linked login with a Lead the Leader job title", async () => {
  const { officeTickBlock } = await import("./office-cycle.ts");
  const base = { linked: true, ticked: false, jobTitle: "Supervisor", ltlJobTitles: ["Supervisor", "Deputy Manager"], leaverOrArchived: false, hasLtlCheck: true };
  assert.equal(officeTickBlock(base), null);
  assert.equal(officeTickBlock({ ...base, jobTitle: " supervisor " }), null);
  assert.match(officeTickBlock({ ...base, linked: false }) ?? "", /not linked to a People record/);
  assert.match(officeTickBlock({ ...base, jobTitle: "Care Assistant" }) ?? "", /does not apply to their job title \(Care Assistant\)/);
  assert.match(officeTickBlock({ ...base, leaverOrArchived: true }) ?? "", /leaver or archived/);
  assert.equal(officeTickBlock({ ...base, ltlJobTitles: null, jobTitle: "Office Administrator" }), null);
  // Already ticked: can always be unticked.
  assert.equal(officeTickBlock({ ...base, ticked: true, jobTitle: "Care Assistant" }), null);
});
