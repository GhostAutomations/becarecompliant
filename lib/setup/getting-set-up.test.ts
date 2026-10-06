import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSetupSteps,
  setupProgress,
  founderCanTick,
  setupAlertDue,
  outstandingByGroup,
  type SetupStatus,
} from "./getting-set-up.ts";

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

test("forms appear on every plan", () => {
  assert.equal(find(base, "forms")?.state, "todo");
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

test("every step has a page to go to", () => {
  const steps = buildSetupSteps(base, { ...opts, hasFormBuilder: true }).flatMap((g) => g.steps);
  assert.deepEqual(steps.filter((s) => !s.href).map((s) => s.key), []);
});

test("a founder tick shows as the founder's, and only when it is what made the step done", () => {
  const ticked = { ...base, steps: { logo: "done" as const, people: "done" as const }, founder_ticked: ["logo", "people"], people: 4 };
  const logo = find(ticked, "logo");
  assert.equal(logo?.state, "done");
  assert.equal(logo?.byFounder, true);
  // Real People records make it done on their own, so the founder's tick is not what counts.
  assert.equal(find(ticked, "people")?.byFounder, false);
  // An Admin's own save stamp is not the founder's.
  const saved = { ...base, steps: { notifications: "done" as const } };
  assert.equal(find(saved, "notifications")?.byFounder, false);
});

test("the founder can tick every step but the agreement and payment", () => {
  const keys = buildSetupSteps(base, opts).flatMap((g) => g.steps).map((x) => x.key);
  assert.deepEqual(keys.filter((k) => !founderCanTick(k)), ["agreement", "payment"]);
});

test("agreement and payment are gates: locked, and no stamp ticks or skips them", () => {
  const stamped = { ...base, agreement_required: true, steps: { agreement: "done" as const, payment: "not_needed" as const } };
  const a = find(stamped, "agreement");
  const p = find(stamped, "payment");
  assert.equal(a?.locked, true);
  assert.equal(a?.state, "todo");
  assert.equal(p?.locked, true);
  assert.equal(p?.state, "todo");
  assert.equal(find(base, "logo")?.locked, false);
});

test("the agreement counts as done where its gate is off, and not where it is on", () => {
  assert.equal(find({ ...base, agreement_required: false }, "agreement")?.state, "done");
  assert.equal(find({ ...base, agreement_required: true }, "agreement")?.state, "todo");
  assert.equal(find({ ...base }, "agreement", { ...opts, legalPublished: true })?.state, "todo");
  assert.equal(find({ ...base, agreement_accepted: true }, "agreement", { ...opts, legalPublished: true })?.state, "done");
});

test("a test company needs no payment", () => {
  assert.equal(find({ ...base, is_test: true, subscription_status: "canceled" }, "payment")?.state, "done");
  assert.equal(find({ ...base, subscription_status: "canceled" }, "payment")?.state, "todo");
});

test("the set up alert is due at ten days, not before", () => {
  const created = new Date("2026-10-01T09:00:00Z");
  assert.equal(setupAlertDue(created, new Date("2026-10-11T08:59:00Z")), false);
  assert.equal(setupAlertDue(created, new Date("2026-10-11T09:00:00Z")), true);
  // Across the clocks going back (25 Oct 2026) it is still ten whole days.
  assert.equal(setupAlertDue("2026-10-20T09:00:00Z", new Date("2026-10-30T09:00:00Z")), true);
  assert.equal(setupAlertDue("not a date", new Date()), false);
});

test("the alert lists only what is still to do, by group", () => {
  const s = { ...base, agreement_required: true, has_logo: true, steps: { training: "not_needed" as const } };
  const out = outstandingByGroup(buildSetupSteps(s, opts));
  const all = out.flatMap((g) => g.labels);
  assert.ok(all.includes("Accept the agreement"));
  assert.ok(!all.includes("Add your logo"));
  assert.ok(!all.includes("Add training history"));
  assert.ok(out.every((g) => g.labels.length > 0));
});

test("absence and probation come before policies, and tick from their saves", () => {
  const keys = buildSetupSteps(base, opts).flatMap((g) => g.steps).map((x) => x.key);
  assert.ok(keys.indexOf("absence") < keys.indexOf("policies"));
  assert.ok(keys.indexOf("probation") < keys.indexOf("policies"));
  assert.equal(find(base, "absence")?.state, "todo");
  assert.equal(find({ ...base, steps: { absence: "done", probation: "done" } }, "probation")?.state, "done");
});
