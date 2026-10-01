/**
 * Be Care Compliant — the "Getting set up" card (Phil, 2026-10-01, agreed by popup).
 *
 * A Company Admin sees it on the dashboard; the founder sees the same ticks on the founder
 * company page. Every company gets it. Steps the data can show tick by themselves; steps it
 * cannot (each branch's registered setting, check settings, forms, notifications) tick the first
 * time that settings page is saved (recordSetupDone). Any step can be marked Not needed. The card
 * goes when nothing is left to do.
 *
 * IMPORTLESS ON PURPOSE: the unit test target for which step is done.
 */

export type SetupState = "done" | "not_needed" | "todo";

export type SetupStatus = {
  tier: string;
  regulator: string | null;
  has_logo: boolean;
  trial_live: boolean;
  subscription_status: string | null;
  agreement_accepted: boolean;
  people: number;
  service_users: number;
  training_records: number;
  policies: number;
  managers: number;
  branches: Array<{ id: string; name: string }>;
  steps: Record<string, "done" | "not_needed">;
};

export type SetupStep = {
  key: string;
  label: string;
  hint: string | null;
  href: string | null;
  state: SetupState;
};

export type SetupGroup = { title: string; steps: SetupStep[] };

/** The keys a stamp may use when a settings page is saved. */
export const SAVE_STAMPS = ["checks_people", "checks_service_users", "forms", "notifications"] as const;
export type SaveStamp = (typeof SAVE_STAMPS)[number];

export const branchStampKey = (branchId: string) => `branch:${branchId}`;

const PAYING = ["active", "trialing", "past_due"];

export function buildSetupSteps(
  s: SetupStatus,
  opts: { one: string; many: string; regulatorName: string | null; hasFormBuilder: boolean },
): SetupGroup[] {
  const step = (key: string, label: string, href: string | null, done: boolean, hint: string | null = null): SetupStep => ({
    key,
    label,
    href,
    hint,
    state: done || s.steps[key] === "done" ? "done" : s.steps[key] === "not_needed" ? "not_needed" : "todo",
  });

  const unchecked = s.branches.filter((b) => s.steps[branchStampKey(b.id)] !== "done");
  const paid = s.tier === "black" || PAYING.includes(s.subscription_status ?? "");
  const reg = opts.regulatorName ?? "your regulator";

  const groups: SetupGroup[] = [
    {
      title: "Company basics",
      steps: [
        step("agreement", "Accept the agreement", "/agreement", s.agreement_accepted),
        step(
          "payment",
          "Set up payment",
          "/settings/billing",
          paid || s.trial_live,
          !paid && s.trial_live ? "On a free trial for now." : null,
        ),
        step("regulator", "Regulator chosen", "/readiness", Boolean(s.regulator), s.regulator ? null : "Ask Be Care Compliant to set it."),
        step("logo", "Add your logo", "/settings/branding", s.has_logo),
      ],
    },
    {
      title: opts.many,
      steps: [
        step(
          "branches",
          `Check each ${opts.one.toLowerCase()}: its name, address and whether it is registered with ${reg} as its own service`,
          "/settings/branches",
          s.branches.length > 0 && unchecked.length === 0,
          unchecked.length && unchecked.length < s.branches.length
            ? `Still to save: ${unchecked.map((b) => b.name).join(", ")}.`
            : "Ticks when each one has been saved once.",
        ),
      ],
    },
    {
      title: "Records in",
      steps: [
        step("people", "Add your People", "/settings/import", s.people > 0, "Import a spreadsheet, or add each person."),
        step("service_users", "Add your Service Users", "/settings/import", s.service_users > 0),
        step("training", "Add training history", "/settings/import", s.training_records > 0),
      ],
    },
    {
      title: "Team and settings",
      steps: [
        step("managers", "Invite your managers", "/settings/users", s.managers > 0),
        step("checks_people", "Look over the People check settings", "/settings/people", false, "Ticks when you save them once."),
        step(
          "checks_service_users",
          "Look over the Service User check settings",
          "/settings/service-users",
          false,
          "Ticks when you save them once.",
        ),
        ...(opts.hasFormBuilder
          ? [step("forms", "Look over your forms", "/settings/forms", false, "Ticks when you save a form once.")]
          : []),
        step("policies", "Upload your policies", "/settings/policies", s.policies > 0),
        step("notifications", "Check the notification settings", "/settings/notifications", false, "Ticks when you save them once."),
      ],
    },
  ];
  return groups;
}

export function setupProgress(groups: SetupGroup[]): { settled: number; total: number; finished: boolean } {
  const all = groups.flatMap((g) => g.steps);
  const settled = all.filter((s) => s.state !== "todo").length;
  return { settled, total: all.length, finished: settled === all.length };
}
