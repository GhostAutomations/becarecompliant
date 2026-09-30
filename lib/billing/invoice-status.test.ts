import test from "node:test";
import assert from "node:assert/strict";
import { invoiceLabel, matchesFilter } from "./invoice-status.ts";

test("founder Invoices: open invoices are Due or Overdue by their due date", () => {
  const now = Date.UTC(2026, 8, 30, 12);
  assert.equal(invoiceLabel({ status: "paid", dueDate: null, nowMs: now }).label, "Paid");
  assert.equal(invoiceLabel({ status: "open", dueDate: now / 1000 + 86400, nowMs: now }).label, "Due");
  assert.equal(invoiceLabel({ status: "open", dueDate: now / 1000 - 60, nowMs: now }).label, "Overdue");
  assert.equal(invoiceLabel({ status: "open", dueDate: null, nowMs: now }).label, "Due", "a card invoice with no due date is not overdue");
  assert.equal(invoiceLabel({ status: "uncollectible", dueDate: null, nowMs: now }).label, "Written off");
  assert.equal(matchesFilter("Overdue", "unpaid"), true);
  assert.equal(matchesFilter("Due", "overdue"), false);
  assert.equal(matchesFilter("Paid", "paid"), true);
  assert.equal(matchesFilter("Void", "all"), true);
});
