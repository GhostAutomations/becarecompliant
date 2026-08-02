import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveRenewalDate, trainingStatus, daysUntilRenewal, renewalPhrase } from "./renewal.ts";
import { parseCivilDate, formatCivilDate, addMonths, daysBetween } from "../recurrence.ts";

/**
 * A carer's certificate is either in date or it is not, and an inspector will ask. These are the
 * two decisions the whole department rests on: when does it fall due again, and what state is it
 * in today.
 */

test("the renewal date is the completion plus the course's own renewal months", () => {
  assert.equal(deriveRenewalDate("2026-08-01", 24), "2028-08-01");
  assert.equal(deriveRenewalDate("2026-08-01", 12), "2027-08-01");
  assert.equal(deriveRenewalDate("2026-08-01", 3), "2026-11-01");
});

test("month ends clamp, so a certificate is not quietly shortened or extended", () => {
  // 31 January renewing in one month is 28 February, not the 3rd of March.
  assert.equal(deriveRenewalDate("2026-01-31", 1), "2026-02-28");
  // And in a leap year it is the 29th.
  assert.equal(deriveRenewalDate("2028-01-31", 1), "2028-02-29");
  assert.equal(deriveRenewalDate("2026-08-31", 6), "2027-02-28");
});

test("a one off course has no renewal date, and rubbish in gives null", () => {
  assert.equal(deriveRenewalDate("2026-08-01", null), null);
  assert.equal(deriveRenewalDate("2026-08-01", 0), null);
  assert.equal(deriveRenewalDate("not a date", 12), null);
  assert.equal(deriveRenewalDate("", 12), null);
});

test("nothing recorded is MISSING, which is not the same as lapsed", () => {
  // Both are red on the matrix. The digest has to tell them apart to write a sentence a manager
  // can act on: "never recorded" and "expired last week" need different replies.
  assert.equal(
    trainingStatus({ recorded: false, expiryOn: null, amberDays: 30, oneOff: false, todayIso: "2026-08-01" }),
    "missing",
  );
});

test("a renewal date in the past is expired, today is not", () => {
  const base = { recorded: true, amberDays: 30, oneOff: false, todayIso: "2026-08-01" };
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-07-31" }), "expired");
  // Due TODAY is not expired: they have the day to do it.
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-08-01" }), "due_soon");
});

test("the amber window is the course's own, and the boundary day counts as due soon", () => {
  const base = { recorded: true, oneOff: false, todayIso: "2026-08-01" };
  // Exactly thirty days out, with a thirty day window: on the list.
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-08-31", amberDays: 30 }), "due_soon");
  // One day past the window: not yet.
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-09-01", amberDays: 30 }), "valid");
  // A course with a 90 day window catches it far earlier, which is the point of the setting.
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-09-01", amberDays: 90 }), "due_soon");
  // A zero window means only the day itself.
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-08-01", amberDays: 0 }), "due_soon");
  assert.equal(trainingStatus({ ...base, expiryOn: "2026-08-02", amberDays: 0 }), "valid");
});

test("a one off course that has been done never expires", () => {
  assert.equal(
    trainingStatus({ recorded: true, expiryOn: null, amberDays: 30, oneOff: true, todayIso: "2026-08-01" }),
    "valid",
  );
});

test("A RECORD WITH NO DATES IS STILL A RECORD", () => {
  /*
   * THE REGRESSION THIS EXISTS TO STOP, found by testing the live page on 2026-08-01.
   *
   * The first version of trainingStatus worked "done" out from whether a date was present. Phil's
   * spreadsheet import marks a one off course as completed with NO dates at all, because the cell
   * simply said "Completed": 90 of the 518 rows. Every one of them went from a green tick to a
   * red cross on the live matrix, and the headline compliance figure fell with them.
   *
   * A record's EXISTENCE and its DATES are two different facts, and only the caller knows the
   * first. It is passed in now.
   */
  assert.equal(
    trainingStatus({ recorded: true, expiryOn: null, amberDays: 30, oneOff: true, todayIso: "2026-08-01" }),
    "valid",
  );
  // Same for a recurring course somebody ticked without filling the date in: in date, and the
  // matrix flags it amber separately so the date gets finished.
  assert.equal(
    trainingStatus({ recorded: true, expiryOn: null, amberDays: 30, oneOff: false, todayIso: "2026-08-01" }),
    "valid",
  );
  // And no record is still missing, whatever dates are passed alongside it.
  assert.equal(
    trainingStatus({ recorded: false, expiryOn: "2027-01-01", amberDays: 30, oneOff: false, todayIso: "2026-08-01" }),
    "missing",
  );
});

test("a renewal that is not a whole number of months is not a renewal", () => {
  assert.equal(deriveRenewalDate("2026-08-01", 12.5), null);
  assert.equal(deriveRenewalDate("2026-08-01", -12), null);
  assert.equal(deriveRenewalDate("2026-08-01", Number.NaN), null);
});

test("a today that is not a date never invents a status or a countdown", () => {
  // Every function here takes today as an argument rather than reading a clock; rubbish in must
  // not silently become "expired" on a carer's record.
  assert.equal(
    trainingStatus({ recorded: true, expiryOn: "2020-01-01", amberDays: 30, oneOff: false, todayIso: "" }),
    "valid",
  );
  assert.equal(daysUntilRenewal("2026-08-11", "not a date"), null);
});

test("the dialog only stops following the course when the stored date disagrees with it", () => {
  /*
   * The rule the cell dialog starts `expiryEdited` from. Deriving on mount instead replaced an
   * override the moment the dialog opened: a course re-accredited early, its date typed by hand,
   * reopened just to attach a certificate, and Save quietly put the rule back. Caught by review.
   */
  const edited = (stored: string | null, completed: string | null, months: number | null) =>
    (stored ?? "") !== (deriveRenewalDate(completed ?? "", months) ?? "");

  // Stored date matches the rule: keep following it.
  assert.equal(edited("2028-08-01", "2026-08-01", 24), false);
  // Re-accredited early and typed by hand: leave it alone.
  assert.equal(edited("2027-03-01", "2026-08-01", 24), true);
  // A renewal date with no completion, as an import can carry: leave it alone, do not blank it.
  assert.equal(edited("2027-01-01", null, 24), true);
  // Nothing recorded at all on a recurring course: follow the rule.
  assert.equal(edited(null, null, 24), false);
});

test("days until renewal, and the phrase a manager reads at seven in the morning", () => {
  assert.equal(daysUntilRenewal("2026-08-11", "2026-08-01"), 10);
  assert.equal(daysUntilRenewal("2026-07-20", "2026-08-01"), -12);
  assert.equal(daysUntilRenewal(null, "2026-08-01"), null);

  assert.equal(renewalPhrase(10), "due in 10 days");
  assert.equal(renewalPhrase(1), "due in 1 day");
  assert.equal(renewalPhrase(0), "due today");
  assert.equal(renewalPhrase(-1), "expired 1 day ago");
  assert.equal(renewalPhrase(-12), "expired 12 days ago");
});

test("the month arithmetic here agrees with lib/recurrence, month for month", () => {
  /*
   * renewal.ts repeats recurrence.ts's month maths on purpose: it must import nothing to stay
   * testable. A second copy of a rule is how the invoicing cron came to bill £89.32 where the
   * builder billed £89.25, so the copy is pinned to the original here rather than trusted.
   */
  const renewals = [1, 2, 3, 6, 12, 24, 36];
  for (let year = 2024; year <= 2029; year++) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 15, 28, 29, 30, 31]) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        // Skip dates that do not exist, e.g. 31 February.
        if (formatCivilDate(parseCivilDate(iso)) !== iso) continue;
        for (const n of renewals) {
          assert.equal(
            deriveRenewalDate(iso, n),
            formatCivilDate(addMonths(parseCivilDate(iso), n)),
            `${iso} plus ${n} months`,
          );
        }
      }
    }
  }
});

test("the day counting here agrees with lib/recurrence too", () => {
  const pairs = [
    ["2026-08-01", "2026-08-11"],
    ["2026-08-01", "2026-07-20"],
    ["2026-02-28", "2028-03-01"],
    ["2025-12-31", "2026-01-01"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(daysUntilRenewal(b, a), daysBetween(parseCivilDate(a), parseCivilDate(b)), `${a} to ${b}`);
  }
});
