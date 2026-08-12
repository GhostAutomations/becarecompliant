import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. booking-time.ts has no runtime imports for exactly this reason. */
import {
  normaliseStartTime,
  isBookableTime,
  bookingHours,
  bookingMinutes,
  BOOKING_FIRST_HOUR,
  BOOKING_LAST_HOUR,
} from "./booking-time.ts";

const ok = (raw: unknown) => {
  const r = normaliseStartTime(raw);
  assert.equal(r.ok, true, `expected ${String(raw)} to be accepted`);
  return r.ok ? r.value : null;
};
const rejected = (raw: unknown) => {
  const r = normaliseStartTime(raw);
  assert.equal(r.ok, false, `expected ${String(raw)} to be refused`);
  return r.ok ? "" : r.error;
};

test("THE TIME THAT STARTED THIS is refused", () => {
  // Phil's dashboard, 2026-08-12: "THU 13 Aug 01:54 Care Plan Review".
  rejected("01:54");
});

test("every one of the nine legacy times is refused", () => {
  for (const bad of ["01:54", "02:53", "00:51", "23:52", "01:53", "17:02", "16:02", "17:03", "19:03", "19:01"]) {
    rejected(bad);
  }
});

test("an empty time is valid and means no time set", () => {
  // Deliberate: untimed bookings are a real thing and the Planner renders them.
  assert.equal(ok(""), null);
  assert.equal(ok("   "), null);
  assert.equal(ok(undefined), null);
  assert.equal(ok(null), null);
});

test("the quarter hour grid is what is accepted", () => {
  assert.equal(ok("09:00"), "09:00");
  assert.equal(ok("09:15"), "09:15");
  assert.equal(ok("09:30"), "09:30");
  assert.equal(ok("09:45"), "09:45");
  assert.match(rejected("09:01"), /quarter hour/);
  assert.match(rejected("09:44"), /quarter hour/);
});

test("the window is 06:00 to 22:00 inclusive at both ends", () => {
  assert.equal(ok("06:00"), "06:00");
  assert.equal(ok("22:00"), "22:00");
  assert.match(rejected("05:45"), /06:00 and 22:00/);
  assert.match(rejected("22:15"), /06:00 and 22:00/);
  assert.match(rejected("00:00"), /06:00 and 22:00/);
});

test("a single digit hour is accepted and padded", () => {
  assert.equal(ok("6:30"), "06:30");
  assert.equal(ok("9:00"), "09:00");
});

test("the seconds Postgres hands back are accepted, other seconds are not", () => {
  assert.equal(ok("14:30:00"), "14:30");
  assert.match(rejected("14:30:07"), /without seconds/);
});

test("rubbish is refused rather than coerced", () => {
  for (const bad of ["not a time", "14", "14:", ":30", "1430", "14:30pm", "25:00", "14:99", 930, {}]) {
    rejected(bad);
  }
});

test("isBookableTime agrees with the validator, and an empty time is not bookable", () => {
  assert.equal(isBookableTime("10:15"), true);
  assert.equal(isBookableTime("10:16"), false);
  // Empty is VALID input but is not a time, so it cannot be shown as one in the picker.
  assert.equal(isBookableTime(""), false);
});

test("the picker offers exactly the hours the rule accepts", () => {
  const hours = bookingHours();
  assert.equal(hours[0], "06");
  assert.equal(hours[hours.length - 1], "22");
  assert.equal(hours.length, BOOKING_LAST_HOUR - BOOKING_FIRST_HOUR + 1);
  for (const h of hours) {
    for (const m of bookingMinutes(h)) {
      assert.equal(normaliseStartTime(`${h}:${m}`).ok, true, `${h}:${m} should be offered and accepted`);
    }
  }
});

test("the last hour offers only the top of the hour, so 22:45 cannot be picked", () => {
  assert.deepEqual(bookingMinutes("22"), ["00"]);
  assert.deepEqual(bookingMinutes("21"), ["00", "15", "30", "45"]);
});
