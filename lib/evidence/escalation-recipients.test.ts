import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { escalationRecipients, type Recipient } from "./escalation-recipients.ts";

function p(over: Partial<Recipient>): Recipient {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    full_name: over.full_name ?? "Someone",
    email: over.email ?? "someone@example.com",
    role: over.role ?? "manager",
    status: over.status ?? "active",
    inBranch: over.inBranch ?? false,
  };
}

describe("who an escalation goes to", () => {
  it("goes to the managers of that branch when there are any", () => {
    const out = escalationRecipients([
      p({ role: "manager", inBranch: true, email: "cardiff@x.com" }),
      p({ role: "registered_manager", email: "rm@x.com" }),
      p({ role: "company_admin", email: "admin@x.com" }),
    ]);
    assert.deepEqual(out.map((r) => r.email), ["cardiff@x.com"]);
  });

  it("does not copy the whole company in as well", () => {
    const out = escalationRecipients([
      p({ role: "manager", inBranch: true, email: "a@x.com" }),
      p({ role: "manager", inBranch: true, email: "b@x.com" }),
      p({ role: "registered_individual", email: "ri@x.com" }),
    ]);
    assert.deepEqual(out.map((r) => r.email).sort(), ["a@x.com", "b@x.com"]);
  });

  it("falls back to the company wide roles when the branch has no manager", () => {
    const out = escalationRecipients([
      p({ role: "supervisor", inBranch: true, email: "sup@x.com" }),
      p({ role: "registered_manager", email: "rm@x.com" }),
    ]);
    assert.deepEqual(out.map((r) => r.email), ["rm@x.com"]);
  });

  it("ignores a manager in a DIFFERENT branch", () => {
    const out = escalationRecipients([
      p({ role: "manager", inBranch: false, email: "newport@x.com" }),
      p({ role: "company_admin", email: "admin@x.com" }),
    ]);
    assert.deepEqual(out.map((r) => r.email), ["admin@x.com"]);
  });

  it("skips anyone inactive or without an email", () => {
    const out = escalationRecipients([
      p({ role: "manager", inBranch: true, status: "invited", email: "pending@x.com" }),
      p({ role: "manager", inBranch: true, email: "" }),
      p({ role: "manager", inBranch: true, email: "live@x.com" }),
    ]);
    assert.deepEqual(out.map((r) => r.email), ["live@x.com"]);
  });

  it("never sends the same person two copies", () => {
    const out = escalationRecipients([
      p({ role: "manager", inBranch: true, email: "Same@x.com" }),
      p({ role: "manager", inBranch: true, email: "same@x.com" }),
    ]);
    assert.equal(out.length, 1);
  });

  it("returns nobody rather than guessing when there is nobody to tell", () => {
    assert.deepEqual(escalationRecipients([p({ role: "supervisor", inBranch: true })]), []);
    assert.deepEqual(escalationRecipients([]), []);
  });
});
