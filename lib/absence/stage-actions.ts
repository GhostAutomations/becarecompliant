/**
 * Stage actions (Phil, 2026-09-29): what each absence stage can lead to, set per company in
 * Settings, Absence. "For Thistle it is up to and including S1 verbal warning, S2 written
 * warning, S3 final written warning, S4 dismissal."
 *
 * A FIXED LIST, not free text (Phil chose it), because three things read it: the invitation
 * letter ({{stage_action}} and {{stage_action_sentence}}), the Book meeting screen, and the
 * Record meeting check that the warning given is within what the stage allows. Free text could
 * not be compared.
 *
 * Only the trigger points method has stage actions. Bradford bands keep their own free text
 * Action, which predates this and names no stage number to compare against.
 *
 * Pure and importless at runtime (type imports are erased), so node --test runs it directly
 * and the client components can import it.
 */

import type { AbsenceConfig, StageThreshold } from "@/lib/absence/logic";

/** Everything an Admin can pick for a stage, mildest first. */
export const STAGE_ACTIONS = [
  "No formal action",
  "Informal discussion",
  "Verbal warning",
  "Written warning",
  "Final written warning",
  "Dismissal",
] as const;
export type StageAction = (typeof STAGE_ACTIONS)[number];

/** The answers the meeting form's "Warning or dismissal" question offers, mildest first. */
export const WARNING_OPTIONS = [
  "None",
  "Verbal warning",
  "Written warning",
  "Final written warning",
  "Dismissal",
] as const;

/** Warnings that stay live on a record for a period (drives "Warning remains live until"). */
export const LIVE_WARNINGS = ["Verbal warning", "Written warning", "Final written warning"] as const;

export function isStageAction(value: unknown): value is StageAction {
  return typeof value === "string" && (STAGE_ACTIONS as readonly string[]).includes(value);
}

/** How severe a warning or a stage action is, on one scale: 0 is no warning at all. The two
 *  informal actions sit at 0 because neither allows a formal warning. Unknown words (an old
 *  "First written warning" answer, say) return null so callers never guess. */
export function severity(value: string | null | undefined): number | null {
  switch ((value ?? "").trim()) {
    case "None":
    case "No formal action":
    case "Informal discussion":
      return 0;
    case "Verbal warning":
      return 1;
    case "Written warning":
    case "First written warning":
      return 2;
    case "Final written warning":
      return 3;
    case "Dismissal":
      return 4;
    default:
      return null;
  }
}

/** The action set for one stage, or null when none is set (or the method is Bradford). */
export function stageActionFor(
  config: Pick<AbsenceConfig, "method" | "thresholds">,
  stage: number | null | undefined,
): StageAction | null {
  if (config.method !== "stages" || !stage) return null;
  const row = (config.thresholds as StageThreshold[]).find((t) => Number(t.stage) === stage);
  return isStageAction(row?.action) ? row.action : null;
}

/** "a verbal warning", "dismissal": the action as it reads inside a sentence. */
export function actionInWords(action: StageAction): string {
  if (action === "Dismissal") return "dismissal";
  return `a ${action.toLowerCase()}`;
}

/**
 * The sentence the invitation letter carries for {{stage_action_sentence}}. Empty when no
 * action is set, so the paragraph drops out of the letter rather than reading "up to and
 * including ." (renderLetterHtml skips empty paragraphs).
 */
export function stageActionSentence(stage: number, action: StageAction | null): string {
  if (!action) return "";
  if (action === "No formal action") {
    return `This is a Stage ${stage} meeting. No formal warning will be given at this stage.`;
  }
  if (action === "Informal discussion") {
    return `This is a Stage ${stage} meeting. It is an informal discussion and no formal warning will be given at this stage.`;
  }
  return `This is a Stage ${stage} meeting and its outcome could be up to and including ${actionInWords(action)}.`;
}

/**
 * Whether a warning recorded at a meeting is within what the stage allows. True when the
 * stage has no action set (nothing to hold it to) or the answer is one we cannot rank.
 */
export function warningAllowed(stageAction: StageAction | null, warning: string | null | undefined): boolean {
  if (!stageAction) return true;
  const w = severity(warning);
  const cap = severity(stageAction);
  if (w === null || cap === null) return true;
  return w <= cap;
}

/** The refusal Record meeting shows when the warning is above what the stage allows. */
export function warningTooHighMessage(stage: number, stageAction: StageAction): string {
  const allowed =
    severity(stageAction) === 0 ? "no formal warning" : `up to and including ${actionInWords(stageAction)}`;
  return `A Stage ${stage} meeting allows ${allowed} under your absence settings. Choose a lower warning, or record this meeting at the right stage.`;
}

/** One line per stage for help text: "Stage 1: up to a verbal warning". Empty when none set. */
export function stageActionLines(config: Pick<AbsenceConfig, "method" | "thresholds">): string[] {
  if (config.method !== "stages") return [];
  return [...(config.thresholds as StageThreshold[])]
    .sort((a, b) => Number(a.stage) - Number(b.stage))
    .filter((t) => isStageAction(t.action))
    .map((t) => {
      const action = t.action as StageAction;
      return severity(action) === 0
        ? `Stage ${t.stage}: ${action.toLowerCase()}`
        : `Stage ${t.stage}: up to and including ${actionInWords(action)}`;
    });
}
