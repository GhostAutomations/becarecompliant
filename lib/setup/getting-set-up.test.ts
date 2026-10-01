import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSetupSteps, setupProgress, type SetupStatus } from "./getting-set-up.ts";

const base: SetupStatus = {
  tier: "business",
  regulator: "ciw",
  has_logo: false,
  trial_live: false,
  subscription_status: null,
  agreement_accepted: false,
  people: 0,
  service_users: 0,
  training_records: 0,
  policies: 0,
  managers: 0,
  branches: [
    { id: "11111111-1111-1111-1111-111111111111", name: "Cardiff" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Newport" },
  ],
  steps: {},
};
const opts = { one: "Branch", many: "Branches", regulatorName: "CIW", hasFormBuilder: false };
const find = (s: SetupStatus, key: string, o = opts) =>
  buildSetupSteps(s, o).flatMap((g) => g.steps).find((x) => x.key === key);

test("a brand new company has work to do", () => {
  const p = setupProgress(buildSetupSteps(base, opts));
  assert.equal(p.finished, false);
  assert.equal(find(base, "regulator")?.state, "done");
});

test("a live trial counts as payment set up, and says so", () => {
  const s = find({ ...base, trial_live: true }, "payment");
  assert.equal(s?.state, "done");
  assert.match(s?.hint ?? "", /trial/);
});

test("Black needs no payment", () => {
  assert.equal(find({ ...base, tier: "black" }, "payment")?.state, "done");
});

test("a cancelled subscription is not payment set up", () => {
  assert.equal(find({ ...base, subscription_status: "canceled" }, "payment")?.state, "todo");
});

test("branches tick only when every branch has been saved", () => {
  const one = { ...base, steps: { "branch:11111111-1111-1111-1111-111111111111": "done" as const } };
  const b = find(one, "branches");
  assert.equal(b?.state, "todo");
  assert.match(b?.hint ?? "", /Newport/);
  assert.doesNotMatch(b?.hint ?? "", /Cardiff/);
  const both = {
    ...base,
    steps: {
      "branch:11111111-1111-1111-1111-111111111111": "done" as const,
      "branch:22222222-2222-2222-2222-222222222222": "done" as const,
    },
  };
  assert.equal(find(both, "branches")?.state, "done");
});

test("a company with no branch cannot tick the branch step by itself", () => {
  assert.equal(find({ ...base, branches: [] }, "branches")?.state, "todo");
});

test("Not needed settles a step without doing it", () => {
  assert.equal(find({ ...base, steps: { policies: "not_needed" } }, "policies")?.state, "not_needed");
});

test("done in the data beats an old Not needed", () => {
  assert.equal(find({ ...base, people: 3, steps: { people: "not_needed" } }, "people")?.state, "done");
});

test("forms appear only with the form builder", () => {
  assert.equal(find(base, "forms"), undefined);
  assert.equal(find(base, "forms", { ...opts, hasFormBuilder: true })?.state, "todo");
});

test("everything settled finishes the card", () => {
  const groups = buildSetupSteps(base, opts).map((g) => ({
    ...g,
    steps: g.steps.map((s) => ({ ...s, state: "not_needed" as const })),
  }));
  assert.equal(setupProgress(groups).finished, true);
});

test("the company's own word for a branch is used", () => {
  const groups = buildSetupSteps(base, { ...opts, one: "House", many: "Houses" });
  assert.ok(groups.some((g) => g.title === "Houses"));
  assert.match(find(base, "branches", { ...opts, one: "House", many: "Houses" })?.label ?? "", /each house/);
});
