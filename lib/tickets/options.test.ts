import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketProblem, ticketSmsText, whereLabel } from "./options.ts";

const ok = { kind: "problem", department: "People", subject: "Cannot save", description: "It fails", rag: "red" };

test("a complete problem passes", () => assert.equal(ticketProblem(ok), null));
test("a problem needs a department", () => assert.equal(ticketProblem({ ...ok, department: "" }), "Choose where the problem is."));
test("a feature needs the acknowledgement", () => {
  assert.equal(ticketProblem({ ...ok, kind: "feature", ack: false }), "Tick to say you understand a new feature may be chargeable.");
  assert.equal(ticketProblem({ ...ok, kind: "feature", department: "", ack: true }), null);
});
test("a rating is required", () => assert.equal(ticketProblem({ ...ok, rag: "" }), "Choose a rating: red, amber or green."));
test("where reads as one line", () => {
  assert.equal(whereLabel("People", "Absence"), "People, Absence");
  assert.equal(whereLabel("Dashboard", null), "Dashboard");
});
test("the founder's text names the company and the rating, with no dashes", () => {
  const s = ticketSmsText({ number: 7, company: "Thistle Care Ltd", raisedBy: "Lauren Morgan", kind: "problem", rag: "red", subject: "Save fails", department: "People", area: "Absence", url: "https://x/founder/tickets/1" });
  assert.match(s, /Thistle Care Ltd/);
  assert.match(s, /Rating: Red\. Needs an urgent response\./);
  assert.match(s, /Report a problem in People, Absence: Save fails/);
  assert.doesNotMatch(s.replace(/https?:\/\/\S+/g, ""), /[–—]| - /);
});
