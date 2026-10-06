/**
 * What the company has already set up in Be Care Compliant that a policy must agree with
 * (Phil, 2026-10-06: the sickness absence policy must follow "whatever we have set up for
 * sickness and absence, whether it is stages or Bradford", and probation "what we've got set
 * up for probation on the system").
 *
 * A policy that says three occasions trigger Stage 1 while the system flags people at four is
 * worse than no policy: the letters, the register and the written policy would disagree in
 * front of an inspector or a tribunal. So these lines go to the AI as fixed facts, not
 * suggestions. Pure, so it can be tested.
 */

import type { AbsenceConfig, BradfordBand, StageThreshold } from "@/lib/absence/logic";
import type { ProbationPeriod } from "@/lib/people/probation";

/* "12 months", "1 week": the same wording as windowLabel and probationLabel, kept here so this
   file has no runtime imports and its test runs on its own. */
const span = (v: { value: number; unit: string }) => `${v.value} ${v.value === 1 ? v.unit : `${v.unit}s`}`;

export type SystemSettings = { absence: AbsenceConfig | null; probation: ProbationPeriod | null };

/** Which standard policies read which settings. */
export const TOPICS_USING_SETTINGS: Record<string, ReadonlyArray<keyof SystemSettings>> = {
  sickness_absence: ["absence"],
  probation: ["probation"],
  capability: ["probation"],
};

export function settingsNeeded(topicKey: string): ReadonlyArray<keyof SystemSettings> {
  return TOPICS_USING_SETTINGS[topicKey] ?? [];
}

/** "a verbal warning", "dismissal", "an informal discussion": as the invitation letters say it. */
function inWords(action: string): string {
  const a = action.trim().toLowerCase();
  if (a === "dismissal" || a === "no formal action") return a;
  return `${/^[aeiou]/.test(a) ? "an" : "a"} ${a}`;
}

function absenceLines(a: AbsenceConfig): string[] {
  const out: string[] = [];
  const window = span(a.window);
  if (a.method === "bradford") {
    out.push(
      `Absence is measured with the Bradford Factor over a rolling ${window}: the score is the number of separate absences squared, multiplied by the total days absent.`,
    );
    for (const b of [...(a.thresholds as BradfordBand[])].sort((x, y) => x.threshold - y.threshold)) {
      out.push(`A Bradford score of ${b.threshold} or more: ${b.label}${b.action ? `, ${b.action}` : ""}.`);
    }
  } else {
    out.push(`Absence is managed in stages, counting separate absences over a rolling ${window}.`);
    for (const t of [...(a.thresholds as StageThreshold[])].sort((x, y) => x.stage - y.stage)) {
      const n = t.occasions;
      const when = typeof n === "number" ? `${n} separate ${n === 1 ? "absence" : "absences"}` : "the trigger the company sets";
      const name = t.label && t.label.trim() !== `Stage ${t.stage}` ? ` (${t.label.trim()})` : "";
      const action = t.action ? `, and its outcome can be up to and including ${inWords(t.action)}` : "";
      out.push(`Stage ${t.stage}${name} is reached at ${when}${action}.`);
    }
  }
  return out;
}

/** The fixed facts for this policy, in plain sentences. Empty when the policy reads none. */
export function systemSettingLines(topicKey: string, s: SystemSettings): string[] {
  const lines: string[] = [];
  for (const need of settingsNeeded(topicKey)) {
    if (need === "absence" && s.absence) lines.push(...absenceLines(s.absence));
    if (need === "probation" && s.probation) {
      lines.push(`The probationary period is ${span(s.probation)} from the start date, and it can be extended.`);
    }
  }
  return lines;
}
