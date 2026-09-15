import test from "node:test";
import assert from "node:assert/strict";
import { calendarClientFrom, tidyAgent, CALENDAR_CLIENTS } from "./calendar-client.ts";

test("an iPhone subscription fetch is Apple", () => {
  assert.equal(calendarClientFrom("iOS/17.5 (21F79) dataaccessd/1.0"), "Apple Calendar");
});

test("a Mac Calendar fetch is Apple", () => {
  assert.equal(calendarClientFrom("Mac OS X/10.15.7 (19H2) CalendarAgent/954.6"), "Apple Calendar");
});

test("Google's importer is Google", () => {
  assert.equal(calendarClientFrom("Google-Calendar-Importer"), "Google Calendar");
});

test("Microsoft's fetchers are Outlook, however they word it", () => {
  assert.equal(calendarClientFrom("Microsoft Office Outlook 16.0"), "Outlook");
  assert.equal(calendarClientFrom("Mozilla/4.0 (compatible; ms-office; MSOffice 16)"), "Outlook");
  assert.equal(calendarClientFrom("Microsoft-WNS/10.0"), "Outlook");
});

test("somebody opening the link in a browser is told apart from a calendar app", () => {
  const CHROME =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  assert.equal(calendarClientFrom(CHROME), "Browser");
});

test("anything unrecognised or absent is Other, never a guess", () => {
  assert.equal(calendarClientFrom("curl/8.4.0"), "Other");
  assert.equal(calendarClientFrom(null), "Other");
  assert.equal(calendarClientFrom(undefined), "Other");
  assert.equal(calendarClientFrom(""), "Other");
});

test("the label set is closed, so rows per person are bounded", () => {
  const agents = [
    "iOS/17.5 dataaccessd/1.0",
    "CalendarAgent/954.6",
    "Google-Calendar-Importer",
    "Microsoft Outlook",
    "curl/8.4.0",
    "anything at all",
    "wget",
  ];
  for (const a of agents) assert.ok(CALENDAR_CLIENTS.includes(calendarClientFrom(a)));
  assert.equal(CALENDAR_CLIENTS.length, 5);
});

test("a raw agent is flattened, trimmed and capped", () => {
  assert.equal(tidyAgent("  a\nb\tc  "), "a b c");
  assert.equal(tidyAgent(null), null);
  assert.equal(tidyAgent("   "), null);
  const long = tidyAgent("x".repeat(500));
  assert.equal(long?.length, 300);
  assert.ok(long?.endsWith("..."));
});
