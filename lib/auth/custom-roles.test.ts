import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COPYABLE_ROLES,
  canCopyRole,
  deleteRefusal,
  displayRoleLabel,
  narrowedDisabled,
  parseRoleChoice,
  roleChoiceValue,
  type CustomRole,
} from "./custom-roles.ts";

const COORDINATOR: CustomRole = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Care Coordinator",
  baseRole: "supervisor",
  off: ["incidents", "planner"],
};

test("a built-in role posts its own key, a custom role posts its id", () => {
  assert.equal(roleChoiceValue("supervisor", null), "supervisor");
  assert.equal(roleChoiceValue("supervisor", COORDINATOR.id), `custom:${COORDINATOR.id}`);
});

test("a posted choice comes back as the built-in role the database will store", () => {
  assert.deepEqual(parseRoleChoice("supervisor", [COORDINATOR]), {
    role: "supervisor",
    companyRoleId: null,
  });
  assert.deepEqual(parseRoleChoice(`custom:${COORDINATOR.id}`, [COORDINATOR]), {
    role: "supervisor",
    companyRoleId: COORDINATOR.id,
  });
});

test("a custom role this company does not have is refused, not guessed at", () => {
  assert.equal(parseRoleChoice("custom:someone-elses-role", [COORDINATOR]), null);
  assert.equal(parseRoleChoice("custom:", [COORDINATOR]), null);
  assert.equal(parseRoleChoice("   ", [COORDINATOR]), null);
});

test("the name shows everywhere; the built-in label is the fallback", () => {
  assert.equal(displayRoleLabel("Supervisor", "Care Coordinator"), "Care Coordinator");
  assert.equal(displayRoleLabel("Supervisor", null), "Supervisor");
  assert.equal(displayRoleLabel("Supervisor", "   "), "Supervisor");
});

test("a custom role narrows beneath its base role, keyed on the role RLS reads", () => {
  const company = new Set(["supervisor|invoicing"]);
  const mine = narrowedDisabled(company, "supervisor", COORDINATOR);
  assert.ok(mine.has("supervisor|incidents"));
  assert.ok(mine.has("supervisor|planner"));
  // What the company switched off for every Supervisor is still off for her.
  assert.ok(mine.has("supervisor|invoicing"));
  // And her narrowing does not leak back into the company's own set.
  assert.equal(company.has("supervisor|incidents"), false);
});

test("no custom role means nothing is added", () => {
  const company = new Set(["supervisor|invoicing"]);
  assert.deepEqual([...narrowedDisabled(company, "supervisor", null)], ["supervisor|invoicing"]);
});

test("Admins and carers cannot be copied", () => {
  assert.equal(canCopyRole("company_admin"), false);
  assert.equal(canCopyRole("platform_admin"), false);
  assert.equal(canCopyRole("staff"), false);
  assert.equal(canCopyRole("supervisor"), true);
  assert.equal(COPYABLE_ROLES.includes("recruiter"), true);
});

test("a role in use cannot be deleted, and the message counts the people", () => {
  assert.equal(deleteRefusal("Care Coordinator", 0), null);
  assert.equal(
    deleteRefusal("Care Coordinator", 1),
    "One person is on Care Coordinator. Move them to another role first.",
  );
  assert.equal(
    deleteRefusal("Care Coordinator", 4),
    "4 people are on Care Coordinator. Move them to another role first.",
  );
});
