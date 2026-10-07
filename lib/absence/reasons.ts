/**
 * Be Care Compliant: the reasons for an absence (Phil, 2026-10-07).
 *
 * The Absence Back Office form asks for one or more reasons, each with its own details box, and
 * for sickness and diarrhoea whether it is still going on and, if not, when it last happened.
 * Everything downstream (the absence list, letters, Return to Work and its AI questions) reads
 * ONE text reason, so this turns the answers into that text. Pure, no imports, tested on its own.
 *
 * The keys here match the form (migration 0420). A form saved before 0420 has a single "reason"
 * box, which is used as it was.
 */

export const DV_REASON = "Sickness and diarrhoea";

export const ABSENCE_REASONS: readonly { value: string; detailKey: string }[] = [
  { value: DV_REASON, detailKey: "reason_detail_sickness_diarrhoea" },
  { value: "Cold or flu", detailKey: "reason_detail_cold_flu" },
  { value: "Headache or migraine", detailKey: "reason_detail_headache_migraine" },
  { value: "Stomach upset", detailKey: "reason_detail_stomach_upset" },
  { value: "Injury", detailKey: "reason_detail_injury" },
  { value: "Back or muscle pain", detailKey: "reason_detail_back_muscle" },
  { value: "Stress or mental health", detailKey: "reason_detail_stress_mental_health" },
  { value: "Dental", detailKey: "reason_detail_dental" },
  { value: "Medical appointment", detailKey: "reason_detail_medical_appointment" },
  { value: "Childcare or dependant", detailKey: "reason_detail_childcare_dependant" },
  { value: "Bereavement", detailKey: "reason_detail_bereavement" },
  { value: "Other", detailKey: "reason_detail_other" },
];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** dd/mm/yyyy from yyyy-mm-dd, else the text as given. */
function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** The single reason text for an absence, or null when nothing was given. */
export function absenceReasonText(answers: Record<string, unknown>): string | null {
  const picked = Array.isArray(answers["reasons"])
    ? (answers["reasons"] as unknown[]).map((v) => String(v))
    : typeof answers["reasons"] === "string" && answers["reasons"]
      ? [answers["reasons"] as string]
      : [];

  if (picked.length === 0) {
    // A form from before 0420: one free text box.
    const legacy = text(answers["reason"]);
    const more = text(answers["further_information"]);
    return [legacy, more].filter(Boolean).join(". ") || null;
  }

  const parts: string[] = [];
  for (const reason of ABSENCE_REASONS) {
    if (!picked.includes(reason.value)) continue;
    const bits: string[] = [];
    const detail = text(answers[reason.detailKey]);
    if (detail) bits.push(detail);
    if (reason.value === DV_REASON) {
      const still = text(answers["dv_still_symptoms"]);
      if (still === "Yes") bits.push("still having symptoms");
      if (still === "No") {
        const d = text(answers["dv_last_episode_date"]);
        const t = text(answers["dv_last_episode_time"]);
        bits.push(d ? `last episode ${ukDate(d)}${t ? ` at ${t.slice(0, 5)}` : ""}` : "no longer having symptoms");
      }
    }
    parts.push(bits.length ? `${reason.value} (${bits.join(", ")})` : reason.value);
  }
  // Anything ticked that is not on the list (a renamed option) is still kept.
  for (const p of picked) {
    if (!ABSENCE_REASONS.some((r) => r.value === p)) parts.push(p);
  }
  const more = text(answers["further_information"]);
  if (more) parts.push(`Further information: ${more}`);
  return parts.join("; ") || null;
}
