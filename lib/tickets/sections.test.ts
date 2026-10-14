import test from "node:test";
import assert from "node:assert/strict";
import { ticketSections } from "./sections.ts";

const t = (id: string, status: string, rag: string, created: string, resolved: string | null = null) => ({
  id,
  status,
  rag,
  created_at: `${created}T10:00:00Z`,
  updated_at: `${created}T10:00:00Z`,
  resolved_at: resolved ? `${resolved}T10:00:00Z` : null,
});

test("open and in progress together, resolved apart, each in red, amber and green", () => {
  const s = ticketSections([
    t("a", "open", "red", "2026-10-01"),
    t("b", "in_progress", "amber", "2026-10-02"),
    t("c", "open", "green", "2026-10-03"),
    t("d", "resolved", "red", "2026-09-01", "2026-09-05"),
    t("e", "resolved", "green", "2026-09-02", "2026-09-03"),
  ]);
  assert.equal(s.openCount, 3);
  assert.equal(s.resolvedCount, 2);
  assert.deepEqual(s.open.red.map((x) => x.id), ["a"]);
  assert.deepEqual(s.open.amber.map((x) => x.id), ["b"]);
  assert.deepEqual(s.open.green.map((x) => x.id), ["c"]);
  assert.deepEqual(s.resolved.red.map((x) => x.id), ["d"]);
  assert.deepEqual(s.resolved.amber, []);
});

test("open: the one waiting longest is at the top", () => {
  const s = ticketSections([
    t("new", "open", "amber", "2026-10-10"),
    t("old", "open", "amber", "2026-09-01"),
    t("mid", "in_progress", "amber", "2026-10-01"),
  ]);
  assert.deepEqual(s.open.amber.map((x) => x.id), ["old", "mid", "new"]);
});

test("resolved: the newest resolved is at the top, whenever it was raised", () => {
  const s = ticketSections([
    t("raisedLastResolvedFirst", "resolved", "green", "2026-10-05", "2026-10-06"),
    t("raisedFirstResolvedLast", "resolved", "green", "2026-09-01", "2026-10-12"),
    t("noResolvedDate", "resolved", "green", "2026-08-01", null),
  ]);
  assert.deepEqual(s.resolved.green.map((x) => x.id), ["raisedFirstResolvedLast", "raisedLastResolvedFirst", "noResolvedDate"]);
});

test("nothing at all: every column empty", () => {
  const s = ticketSections([]);
  assert.equal(s.openCount, 0);
  assert.deepEqual(s.open, { red: [], amber: [], green: [] });
  assert.deepEqual(s.resolved, { red: [], amber: [], green: [] });
});
