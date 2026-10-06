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
  /** The founder's per company switch for the agreement gate before the terms are published (0346). */
  agreement_required?: boolean;
  /** A test company is never billed (0368). */
  is_test?: boolean;
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
  /** Steps the founder ticked off by hand (0367), so the card can say so and offer Undo. */
  founder_ticked?: string[];
};

export type SetupStep = {
  key: string;
  label: string;
  hint: string | null;
  href: string | null;
  state: SetupState;
  /** Ticked off by Be Care Compliant rather than by the company or its data (0367). */
  byFounder: boolean;
  /** A gate, not a job: it ticks itself and nobody can mark it done or not needed (0368). */
  locked: boolean;
};

export type SetupGroup = { title: string; steps: SetupStep[] };

/** The keys a stamp may use when a settings page is saved. */
export const SAVE_STAMPS = ["checks_people", "checks_service_users", "forms", "notifications"] as const;
export type SaveStamp = (typeof SAVE_STAMPS)[number];

export const branchStampKey = (branchId: string) => `branch:${branchId}`;

const PAYING = ["active", "trialing", "past_due"];

/** Sign up gates: they tick themselves, with no Mark done or Not needed for anyone (0368). */
export const GATE_STEPS: readonly string[] = ["agreement", "payment"];

export function buildSetupSteps(
  s: SetupStatus,
  opts: {
    one: string;
    many: string;
    regulatorName: string | null;
    hasFormBuilder: boolean;
    /** Terms published (lib/legal): the agreement gate is on for every company. */
    legalPublished?: boolean;
  },
): SetupGroup[] {
  const step = (key: string, label: string, href: string | null, done: boolean, hint: string | null = null): SetupStep => {
    const locked = GATE_STEPS.includes(key);
    // A gate goes only by what the company actually did; no stamp can tick or skip it.
    if (locked) return { key, label, href, hint, state: done ? "done" : "todo", byFounder: false, locked };
    return {
      key,
      label,
      href,
      hint,
      state: done || s.steps[key] === "done" ? "done" : s.steps[key] === "not_needed" ? "not_needed" : "todo",
      // Only when the founder's tick is what made it done: real data or the Admin's own save wins.
      byFounder: !done && s.steps[key] === "done" && (s.founder_ticked ?? []).includes(key),
      locked,
    };
  };

  const unchecked = s.branches.filter((b) => s.steps[branchStampKey(b.id)] !== "done");
  const paid = s.tier === "black" || PAYING.includes(s.subscription_status ?? "");
  const reg = opts.regulatorName ?? "your regulator";

  const groups: SetupGroup[] = [
    {
      title: "Company basics",
      steps: [
        /* GATES (Phil, 2026-10-02): "accept the agreement and add payment should already be green".
           The Admin meets both at first sign in, so they tick themselves. The agreement also counts
           where its gate is off for this company; payment where the company is never billed. */
        step(
          "agreement",
          "Accept the agreement",
          "/agreement",
          s.agreement_accepted || !(opts.legalPublished || Boolean(s.agreement_required)),
        ),
        step(
          "payment",
          "Set up payment",
          "/settings/billing",
          paid || s.trial_live || Boolean(s.is_test),
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
        // Every plan (Phil, 2026-10-01): Business looks over its forms read only.
        step("forms", "Look over your forms", "/settings/forms", false, "Ticks when you tell us you are happy with them, as you leave the Forms page."),
        step("policies", "Upload your policies", "/policies", s.policies > 0),
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

/**
 * THE FOUNDER CAN TICK EVERY STEP EXCEPT THE GATES (Phil, popup 2026-10-01, then 2026-10-02: the
 * agreement and payment tick themselves). founder_set_setup_step refuses them too; this only hides
 * the button.
 */
export function founderCanTick(stepKey: string): boolean {
  return !GATE_STEPS.includes(stepKey);
}

/** Ten days after creation (Phil, popup 2026-10-01: "10 days after creation, once"). */
export const SETUP_ALERT_DAYS = 10;

export function setupAlertDue(createdAt: string | Date, now: Date): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created >= SETUP_ALERT_DAYS * 24 * 60 * 60 * 1000;
}

/** What is still to do, by group, for the 10 day alert. Not needed steps are settled, not listed. */
export function outstandingByGroup(groups: SetupGroup[]): Array<{ title: string; labels: string[] }> {
  return groups
    .map((g) => ({ title: g.title, labels: g.steps.filter((x) => x.state === "todo").map((x) => x.label) }))
    .filter((g) => g.labels.length > 0);
}
