import { test } from "node:test";
import assert from "node:assert/strict";
import { waitingSentence, waitingParts, waitingTotal, NO_WAITING } from "./waiting.ts";

test("nothing waiting says nothing", () => {
  assert.equal(waitingSentence(NO_WAITING), null);
  assert.equal(waitingTotal(NO_WAITING), 0);
});

test("Thistle on 23/09/2026: 5 appraisals, 1 supervision for an appraisal, 2 for probation", () => {
  assert.equal(
    waitingSentence({ sup3: 5, appraisal: 1, probation: 2 }),
    "8 checks are waiting on an earlier check, so they are not counted here: 5 appraisals waiting for Supervision 3, 1 supervision waiting for an appraisal, 2 supervisions waiting for probation to be signed off.",
  );
});

test("one check reads in the singular", () => {
  assert.equal(
    waitingSentence({ sup3: 0, appraisal: 0, probation: 1 }),
    "1 check is waiting on an earlier check, so it is not counted here: 1 supervision waiting for probation to be signed off.",
  );
});

test("only the reasons that apply are listed, and no dashes", () => {
  const parts = waitingParts({ sup3: 1, appraisal: 0, probation: 0 });
  assert.deepEqual(parts, ["1 appraisal waiting for Supervision 3"]);
  const s = waitingSentence({ sup3: 2, appraisal: 3, probation: 0 }) ?? "";
  assert.ok(!/[–—]| - /.test(s));
});
