import "server-only";

/**
 * Be Care Compliant — what the invitation LETTER needs beyond the booking (Phil, 2026-10-06):
 * the company's name for these meetings, the letterhead (logo, office address, phone), the
 * employee's home address, the conductor's job title, and the absences the meeting is about.
 *
 * Read with the service role because the conductor's own record, the logo file and the office
 * phone are not all visible to every manager who books a meeting; every query is pinned to the
 * one company and person the caller has already been checked against (planBooking and friends).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { getAbsenceConfig } from "@/lib/absence/data";
import { countedAbsences, windowStartIso } from "@/lib/absence/discount";
import { windowLabel } from "@/lib/absence/window";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { officeAddress, resolveBranchAddress, type BranchAddressRow } from "@/lib/branches/office-address";
import { ROLE_LABELS } from "@/lib/nav";
import { meetingNameInSentence } from "@/lib/absence/meeting-name";
import type { InvitationAbsence } from "@/lib/absence/invitation-letter";

export type LetterExtras = {
  meetingName: string | null;
  homeAddress: string | null;
  letterheadAddress: string | null;
  letterheadPhone: string | null;
  logoDataUrl: string | null;
  conductorRole: string | null;
  absences: InvitationAbsence[];
  windowWords: string;
};

/** The company's name for these meetings, as stored (null for the default). */
export async function companyMeetingName(companyId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin.from("absence_config").select("meeting_name").eq("company_id", companyId).maybeSingle();
  return ((data?.meeting_name as string | null) ?? null) || null;
}

/** "Stage 2 disciplinary hearing", or "disciplinary hearing" with no stage. */
export function stageLabelFor(stage: number | null | undefined, meetingName: string | null): string {
  const name = meetingNameInSentence(meetingName);
  return stage ? `Stage ${stage} ${name}` : name;
}

export async function loadLetterExtras(opts: {
  companyId: string;
  personId: string;
  conductorId: string;
  /** Count absences as they stood on this day (yyyy-mm-dd). A copy made afterwards counts as of the
   *  booking day, so it lists what the original letter listed. Today when not given. */
  asOfIso?: string;
}): Promise<LetterExtras> {
  const admin = createServiceClient();
  const [{ data: person }, { data: branches }, { data: conductorPerson }, { data: conductorProfile }, { data: events }, meetingName, logoDataUrl, config] =
    await Promise.all([
      admin.from("people").select("branch_id, home_address").eq("id", opts.personId).eq("company_id", opts.companyId).maybeSingle(),
      admin.from("branches").select("id, name, kind, address, phone, uses_office_address").eq("company_id", opts.companyId),
      admin.from("people").select("job_title").eq("company_id", opts.companyId).eq("profile_id", opts.conductorId).limit(1).maybeSingle(),
      admin.from("profiles").select("role").eq("id", opts.conductorId).maybeSingle(),
      admin
        .from("absence_events")
        .select("start_date, end_date, days, reason, discounted_at")
        .eq("company_id", opts.companyId)
        .eq("person_id", opts.personId),
      companyMeetingName(opts.companyId),
      getCompanyLogoDataUrl(opts.companyId).catch(() => null),
      getAbsenceConfig(opts.companyId),
    ]);

  // Letterhead: the employee's branch office when it has premises of its own, else the main office.
  const rows = (branches ?? []) as (BranchAddressRow & { phone: string | null })[];
  const office = rows.find((b) => b.kind === "team") ?? null;
  const own = rows.find((b) => b.id === person?.branch_id) ?? null;
  const useOwn = own && own.kind !== "team" && !own.uses_office_address;
  const head = useOwn ? own : office;
  const headAddress = head ? resolveBranchAddress(head, officeAddress(rows)).address : null;

  const today = opts.asOfIso && /^\d{4}-\d{2}-\d{2}$/.test(opts.asOfIso) ? opts.asOfIso : formatCivilDate(todayInLondon());
  const windowStart = windowStartIso(today, config.window);
  const counted = countedAbsences(
    ((events ?? []) as Array<InvitationAbsence & { discounted_at: string | null }>).filter((e) => e.start_date <= today),
    { windowStart },
  );

  const jobTitle = ((conductorPerson?.job_title as string | null) ?? "").trim();
  const role = (conductorProfile?.role as string | undefined) ?? "";
  return {
    meetingName,
    homeAddress: ((person?.home_address as string | null) ?? null) || null,
    letterheadAddress: headAddress,
    letterheadPhone: (head?.phone ?? null) || null,
    logoDataUrl,
    conductorRole: jobTitle || ROLE_LABELS[role] || null,
    absences: counted.map((e) => ({ start_date: e.start_date, end_date: e.end_date, days: e.days, reason: e.reason })),
    windowWords: windowLabel(config.window),
  };
}
