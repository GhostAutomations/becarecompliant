import test from "node:test";
import assert from "node:assert/strict";
import {
  initials,
  eventTitle,
  escapeText,
  foldLine,
  endLocalDateTime,
  buildPlannerFeed,
  DEFAULT_DURATION_MINUTES,
  type PlannerFeedEvent,
} from "./ics.ts";

const OPTS = { calendarName: "BCC Planner", uidDomain: "becarecompliant.com", now: new Date("2026-09-15T09:00:00Z") };

function ev(over: Partial<PlannerFeedEvent> = {}): PlannerFeedEvent {
  return {
    id: "b1",
    label: "Care Plan Review",
    subjectName: "Mary Jones",
    branchName: "Cardiff",
    scheduledDate: "2026-09-17",
    startTime: "10:00",
    durationMinutes: 45,
    status: "planned",
    notes: null,
    url: "https://www.becarecompliant.com/planner",
    updatedAt: "2026-09-15T08:00:00Z",
    ...over,
  };
}

/**
 * Undo the 75-octet folding, so a test can assert on the sentence a calendar will read rather
 * than on wherever the fold happened to land. Asserting on folded text passes or fails by
 * accident depending on how long the line before it was.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

test("initials reduce a name to letters and dots", () => {
  assert.equal(initials("Mary Jones"), "M.J.");
  assert.equal(initials("mary jones"), "M.J.");
  assert.equal(initials("Mary Anne Jones"), "M.A.J.");
});

test("a hyphenated or apostrophed name is one part, not two", () => {
  assert.equal(initials("Mary-Anne Jones"), "M.J.");
  assert.equal(initials("Siobhan O'Brien"), "S.O.");
});

test("initials survive an accent and give back nothing when there are no letters", () => {
  assert.equal(initials("Émile Zola"), "É.Z.");
  assert.equal(initials("   "), null);
  assert.equal(initials("-- --"), null);
  assert.equal(initials(null), null);
  assert.equal(initials(""), null);
});

test("the title carries initials and the branch, never the full name", () => {
  assert.equal(eventTitle(ev()), "Care Plan Review - M.J. (Cardiff)");
  const t = eventTitle(ev());
  assert.ok(!t.includes("Mary"), "the title must not contain a first name");
  assert.ok(!t.includes("Jones"), "the title must not contain a surname");
});

test("a task about nobody just says what it is", () => {
  assert.equal(eventTitle(ev({ subjectName: null })), "Care Plan Review (Cardiff)");
  assert.equal(eventTitle(ev({ subjectName: null, branchName: null })), "Care Plan Review");
});

test("escaping handles backslash, semicolon, comma and newline", () => {
  assert.equal(escapeText("a\\b"), "a\\\\b");
  assert.equal(escapeText("a;b,c"), "a\\;b\\,c");
  assert.equal(escapeText("a\nb"), "a\\nb");
  assert.equal(escapeText("a\r\nb"), "a\\nb");
});

test("folding leaves a short line alone and continues a long one with a space", () => {
  assert.equal(foldLine("SHORT:line"), "SHORT:line");
  const folded = foldLine("X:" + "a".repeat(200));
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const p of parts.slice(1)) assert.ok(p.startsWith(" "), "continuation lines begin with a space");
  assert.equal(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(""), "X:" + "a".repeat(200));
});

test("folding counts bytes, so an accented line stays inside 75 octets", () => {
  const folded = foldLine("SUMMARY:" + "é".repeat(80));
  for (const p of folded.split("\r\n")) {
    assert.ok(new TextEncoder().encode(p).length <= 75, "every folded line is at most 75 octets");
  }
});

test("a booking runs for its duration, and an hour when it has none", () => {
  assert.equal(endLocalDateTime("2026-09-17", "10:00", 45), "20260917T104500");
  assert.equal(endLocalDateTime("2026-09-17", "23:30", 60), "20260918T003000");
  assert.equal(DEFAULT_DURATION_MINUTES, 60);
});

test("a timed booking is written in London time, not converted to UTC", () => {
  const ics = buildPlannerFeed([ev()], OPTS);
  assert.ok(ics.includes("DTSTART;TZID=Europe/London:20260917T100000"));
  assert.ok(ics.includes("DTEND;TZID=Europe/London:20260917T104500"));
  assert.ok(ics.includes("BEGIN:VTIMEZONE"));
  assert.ok(ics.includes("TZID:Europe/London"));
});

test("a booking with no time is an all-day event ending the next date", () => {
  const ics = buildPlannerFeed([ev({ startTime: null, durationMinutes: null })], OPTS);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260917"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20260918"));
});

test("a cancelled booking is not in the file at all", () => {
  const ics = buildPlannerFeed([ev({ status: "cancelled" })], OPTS);
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("a completed booking stays, and says it is done", () => {
  const ics = buildPlannerFeed([ev({ status: "completed" })], OPTS);
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(unfold(ics).includes("Completed in Be Care Compliant."));
});

test("the uid is the booking id, so a booking that moves updates instead of doubling", () => {
  const a = buildPlannerFeed([ev({ scheduledDate: "2026-09-17" })], OPTS);
  const b = buildPlannerFeed([ev({ scheduledDate: "2026-09-24" })], OPTS);
  assert.ok(a.includes("UID:planner-b1@becarecompliant.com"));
  assert.ok(b.includes("UID:planner-b1@becarecompliant.com"));
});

test("no full name reaches the file, in the title or anywhere else", () => {
  const ics = buildPlannerFeed([ev({ notes: null })], OPTS);
  assert.ok(!ics.includes("Mary"));
  assert.ok(!ics.includes("Jones"));
});

test("the file is a well formed calendar with CRLF line endings", () => {
  const ics = buildPlannerFeed([ev()], OPTS);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every newline is preceded by a carriage return");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 1);
});

test("an empty planner is still a valid, empty calendar", () => {
  const ics = buildPlannerFeed([], OPTS);
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("the refresh hints are present for the clients that honour them", () => {
  const ics = buildPlannerFeed([], OPTS);
  assert.ok(ics.includes("X-PUBLISHED-TTL:PT15M"));
  assert.ok(ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT15M"));
});


test("a planned task carries a labelled link to the form that completes it", () => {
  const ics = buildPlannerFeed(
    [ev({ url: "https://www.becarecompliant.com/service-users/su1/checks/c1/complete" })],
    OPTS,
  );
  const text = unfold(ics);
  assert.ok(text.includes("Open this task in Be Care Compliant:"));
  assert.ok(text.includes("https://www.becarecompliant.com/service-users/su1/checks/c1/complete"));
  // Set as a property too, for the clients that surface it, but never the only copy.
  assert.ok(text.includes("URL:https://www.becarecompliant.com/service-users/su1/checks/c1/complete"));
});

test("a completed task points at the record, not at completing it again", () => {
  const ics = buildPlannerFeed(
    [ev({ status: "completed", url: "https://www.becarecompliant.com/service-users/su1" })],
    OPTS,
  );
  const text = unfold(ics);
  assert.ok(text.includes("Open the record in Be Care Compliant:"));
  assert.ok(!text.includes("Open this task in Be Care Compliant:"));
});

test("a task with no link at all still writes a valid event", () => {
  const ics = buildPlannerFeed([ev({ url: null })], OPTS);
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(!ics.includes("URL:"));
});
