import { test } from "node:test";
import assert from "node:assert/strict";
import { ukMobileFromE164 } from "./sheet-number.ts";

test("our text number is shown as a carer would dial it", () => {
  assert.equal(ukMobileFromE164("+447700900123"), "07700 900123");
  assert.equal(ukMobileFromE164("+44 7700 900123"), "07700 900123");
  assert.equal(ukMobileFromE164(null), null);
  // not a UK mobile: not shown, the sheet says "the office text number" instead
  assert.equal(ukMobileFromE164("+12025550123"), null);
  assert.equal(ukMobileFromE164("BCC"), null);
});
