import "server-only";

/**
 * Be Care Compliant — the absence meeting invitation letters, built once and used everywhere:
 * the approval preview, the send (book and rearrange), and the copy made automatically for a
 * meeting booked before copies were kept (Phil, 2026-10-06: "It should all be automatic").
 * Moved out of actions.ts so a page can call ensureInvitationCopies without it being a server
 * action anyone could post to.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { letterWordingFor } from "@/lib/letters/data";
import { mergeLetterText, renderLetterHtml, renderLetterSubject } from "@/lib/letters/letters";
import { getAbsenceConfig } from "@/lib/absence/data";
import { stageActionFor, stageActionSentence } from "@/lib/absence/stage-actions";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { siteUrl } from "@/lib/site";
import { buildInvitationLetter, type InvitationLetter } from "@/lib/absence/invitation-letter";
import { renderInvitationLetterPdf } from "@/lib/absence/invitation-letter-pdf";
import { loadLetterExtras, stageLabelFor } from "@/lib/absence/letter-extras";
import { meetingNameAsTitle } from "@/lib/absence/meeting-name";
import { keepMeetingLetter, REBUILT_NOTICE } from "@/lib/absence/meeting-letter-copy";

export type MeetingLetterArgs = {
  supabase: { from: (t: string) => any };
  personId: string;
  meetingId: string;
  responseToken: string;
  companyId: string;
  branchId: string | null;
  companyName: string;
  stage: number;
  meetingDate: string;
  timeHHMM: string;
  duration: number;
  location: string;
  locationKind: "office" | "teams";
  employee: { profileId: string | null; name: string; email: string | null };
  conductor: { id: string; name: string; email: string | null };
  rearranged: boolean;
  /** The date printed on the letter; today unless a copy is being made afterwards. */
  letterDateIso?: string;
};

export type MeetingLetter = {
  key: "employee" | "conductor";
  profileId: string | null;
  name: string;
  email: string | null;
  eventTitle: string;
  detailHtml: string;
  hideCta: boolean;
};

export type MeetingLetterSet = {
  letters: MeetingLetter[];
  /** The employee's letter, the PDF attached to both emails and kept in Evidence history. */
  invitation: InvitationLetter;
  logoDataUrl: string | null;
};

/** The formal letter pair for a booked or rearranged meeting.
 *
 *  THE EMPLOYEE (Phil, 2026-10-06, Thistle's format): a short branded email, "Dear Jo Bloggs,
 *  please find attached a letter about your Stage 2 disciplinary hearing", with the Accept / I
 *  cannot attend buttons and the calendar invite, and the LETTER itself attached as a PDF laid out
 *  like the company's own: letterhead, date, home address, the company's wording, when and where,
 *  every absence it is about, and the sign off (invitation-letter.ts).
 *
 *  THE CONDUCTOR: the chairing copy as before (unambiguous that THEY are holding it, not attending
 *  one: Phil, 2026-07-12), with the same PDF attached so they have what the employee was sent.
 *
 *  Built once here and used for the approval preview and the send, so what is approved is what
 *  goes. A letter with no address comes back with email null. */
export async function buildMeetingLetters(args: MeetingLetterArgs): Promise<MeetingLetterSet> {
  const extras = await loadLetterExtras({
    companyId: args.companyId,
    personId: args.personId,
    conductorId: args.conductor.id,
  });
  // What the company calls these meetings (0408): "Stage 2 disciplinary hearing" for Thistle.
  const stageLabel = stageLabelFor(args.stage, extras.meetingName);

  // The WORDING of these letters belongs to the company (Settings > Letters). We read
  // their version and fall back to the packaged default, so a letter can never fail to
  // send because wording is missing. Everything functional (the response buttons, the
  // calendar attachment, the Teams note) is still added by us, around their words.
  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(args.meetingDate)
    ? args.meetingDate.split("-").reverse().join("/")
    : args.meetingDate;
  const values: Record<string, string> = {
    recipient_name: args.employee.name,
    employee_name: args.employee.name,
    company_name: args.companyName,
    stage: String(args.stage),
    stage_label: stageLabel,
    conductor_name: args.conductor.name,
    meeting_date: displayDate,
    meeting_time: args.timeHHMM,
    meeting_when: `${displayDate} at ${args.timeHHMM}`,
    location: args.locationKind === "teams" ? "Microsoft Teams" : args.location,
    duration: `${args.duration} minutes`,
  };

  // What this stage can lead to (Settings, Absence; Phil 2026-09-29). Read here rather than
  // passed in, so booking and rearranging can never disagree about it.
  const stageAction = stageActionFor(await getAbsenceConfig(args.companyId), args.stage);
  values.stage_action = stageAction ?? "";
  values.stage_action_sentence = stageActionSentence(args.stage, stageAction);

  const [employeeLetter, conductorLetter, rearrangedLetter] = await Promise.all([
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_invite_employee"),
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_invite_conductor"),
    letterWordingFor(args.supabase, args.companyId, "absence_meeting_rearranged"),
  ]);

  const paragraphsOf = (body: string) =>
    mergeLetterText(body, values)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

  const invitation = buildInvitationLetter({
    companyName: args.companyName,
    letterheadAddress: extras.letterheadAddress,
    letterheadPhone: extras.letterheadPhone,
    letterDateIso: args.letterDateIso ?? formatCivilDate(todayInLondon()),
    recipientName: args.employee.name,
    recipientAddress: extras.homeAddress,
    stage: args.stage,
    stageLabel,
    meetingTitle: meetingNameAsTitle(extras.meetingName),
    meetingDateIso: args.meetingDate,
    meetingTime: args.timeHHMM,
    durationMinutes: args.duration,
    location: args.location,
    teams: args.locationKind === "teams",
    conductorName: args.conductor.name,
    conductorRole: extras.conductorRole,
    wordingParagraphs: paragraphsOf(employeeLetter.body),
    rearrangedNote: args.rearranged ? paragraphsOf(rearrangedLetter.body).join(" ") || null : null,
    absences: extras.absences,
    windowWords: extras.windowWords,
  });

  const teamsNote =
    args.locationKind === "teams"
      ? `<p style="margin:0 0 10px 0;">A Teams invite will follow shortly.</p>`
      : "";
  const rearrangedNote = args.rearranged
    ? `<p style="margin:0 0 10px 0;color:#fcd34d;">${renderLetterHtml(rearrangedLetter.body, values)
        .replace(/<\/?p[^>]*>/g, "")
        .trim()}</p>`
    : "";
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const respondBase = `${siteUrl()}/meeting-response/${args.responseToken}`;
  const letters: MeetingLetter[] = [
    {
      key: "employee",
      profileId: args.employee.profileId,
      name: args.employee.name,
      email: args.employee.email,
      eventTitle: renderLetterSubject(employeeLetter.subject, values) || stageLabel,
      hideCta: true, // employees have no app account: no Open button
      detailHtml: `
        ${rearrangedNote}
        <p style="margin:0 0 10px 0;">Dear ${esc(args.employee.name)},</p>
        <p style="margin:0 0 10px 0;">Please find attached a letter about your ${esc(stageLabel)} on ${esc(values.meeting_when)}. Please read it carefully.</p>
        <p style="margin:0 0 14px 0;">Please let us know whether you can attend.</p>
        ${teamsNote}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:12px;background:#f59e0b;">
            <a href="${respondBase}?intent=accept" style="display:inline-block;padding:11px 20px;font-size:13px;font-weight:700;color:#081231;text-decoration:none;border-radius:12px;">Accept the invitation</a>
          </td>
          <td style="padding-left:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;border:1px solid rgba(255,255,255,0.35);">
              <a href="${respondBase}?intent=decline" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:700;color:#e8ecf6;text-decoration:none;border-radius:12px;">I cannot attend</a>
            </td></tr></table>
          </td>
        </tr></table>
        <p style="margin:12px 0 0 0;font-size:12px;color:#a8b2cc;">If you cannot attend you will be asked for the reason, and the meeting organiser will be told.</p>`,
    },
    {
      key: "conductor",
      profileId: args.conductor.id,
      name: args.conductor.name,
      email: args.conductor.email,
      eventTitle:
        renderLetterSubject(conductorLetter.subject, values) ||
        `${meetingNameAsTitle(extras.meetingName)} with ${args.employee.name} (Stage ${args.stage})`,
      hideCta: false,
      detailHtml: `
        ${rearrangedNote}
        ${renderLetterHtml(conductorLetter.body, { ...values, recipient_name: args.conductor.name })}
        <p style="margin:0 0 10px 0;">A copy of the letter ${esc(args.employee.name)} was sent is attached.</p>
        ${teamsNote}`,
    },
  ];
  return { letters, invitation, logoDataUrl: extras.logoDataUrl };
}

/** The attached letter as simple HTML, for the approval preview only. */
export function invitationPreviewHtml(l: InvitationLetter): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const p = (t: string, extra = "") => `<p style="margin:0 0 8px 0;${extra}">${esc(t)}</p>`;
  return `
    <div style="margin:18px 0 0 0;padding:20px;background:#ffffff;color:#111827;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;">
      <p style="margin:0 0 12px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">The attached letter (PDF)</p>
      <div style="text-align:right;font-size:12px;">${[...l.letterheadLines, ...l.phoneLines].map(esc).join("<br/>")}</div>
      ${p(l.date, "text-align:right;margin-top:10px;")}
      ${p(l.recipientLines.join("\n")).replace(/\n/g, "<br/>")}
      ${p(l.salutation)}
      ${p(l.reLine, "font-weight:700;")}
      ${l.opening.map((t) => p(t)).join("")}
      ${p(l.details.map((d) => `${d.label}: ${d.value}`).join("\n")).replace(/\n/g, "<br/>")}
      ${p(l.absenceIntro)}
      <ul style="margin:0 0 8px 18px;padding:0;">${l.absenceLines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${l.closing.map((t) => p(t)).join("")}
      ${p([l.signOff.closing, "", l.signOff.name, l.signOff.role ?? ""].join("\n")).replace(/\n/g, "<br/>")}
    </div>`;
}

/**
 * A COPY FOR EVERY BOOKED MEETING, AUTOMATICALLY (Phil, 2026-10-06: "I don't want to have to
 * press keep a copy of the invitation letter. It should be automatic.").
 *
 * Every booking and rearrangement from today keeps its copy as the letter goes. A meeting booked
 * BEFORE copies were kept has none, so this makes it: rebuilt from the booking details and the
 * same wording, dated the day it was booked, signed off as whoever booked it, and marked on the
 * PDF as made afterwards. Called when a person's record or the Absence page is opened, so it
 * happens without anyone asking. Sends nothing.
 *
 * Only meetings still waiting to be held, with a time and somebody holding them, and with no copy
 * at all. Safe to run twice: a database index allows one made-afterwards copy per meeting, so two
 * pages opened at once cannot make two. Never throws: a copy that cannot be made is logged and the
 * page still loads.
 */
export async function ensureInvitationCopies(opts: { companyId: string; personId?: string }): Promise<void> {
  try {
    const admin = createServiceClient();
    let q = admin
      .from("absence_meetings")
      .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, duration_minutes, location, conducted_by, booked_by, response_token, created_at")
      .eq("company_id", opts.companyId)
      .is("evidence_id", null)
      .not("meeting_time", "is", null)
      .not("conducted_by", "is", null)
      .not("stage", "is", null);
    if (opts.personId) q = q.eq("person_id", opts.personId);
    const { data: meetings } = await q;
    const list = (meetings ?? []) as Array<Record<string, unknown>>;
    if (list.length === 0) return;

    const ids = list.map((m) => m.id as string);
    const { data: have } = await admin.from("absence_meeting_letters").select("meeting_id").in("meeting_id", ids);
    const covered = new Set(((have ?? []) as Array<{ meeting_id: string | null }>).map((h) => h.meeting_id));
    const missing = list.filter((m) => !covered.has(m.id as string));
    if (missing.length === 0) return;

    const { data: company } = await admin.from("companies").select("name").eq("id", opts.companyId).maybeSingle();
    for (const m of missing) {
      const [{ data: person }, { data: conductor }, { data: booker }] = await Promise.all([
        admin.from("people").select("full_name, work_email, profile_id").eq("id", m.person_id as string).maybeSingle(),
        admin.from("profiles").select("id, full_name, email").eq("id", m.conducted_by as string).maybeSingle(),
        m.booked_by
          ? admin.from("profiles").select("id, full_name, email").eq("id", m.booked_by as string).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!person || !conductor) continue;
      let employeeEmail = (person.work_email as string | null) ?? null;
      if (!employeeEmail && person.profile_id) {
        const { data: login } = await admin.from("profiles").select("email").eq("id", person.profile_id as string).maybeSingle();
        employeeEmail = (login?.email as string | null) ?? null;
      }
      const location = String(m.location ?? "");
      const bookedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(m.created_at as string));
      const args: MeetingLetterArgs = {
        supabase: admin,
        personId: m.person_id as string,
        meetingId: m.id as string,
        responseToken: String(m.response_token ?? ""),
        companyId: opts.companyId,
        branchId: (m.branch_id as string | null) ?? null,
        companyName: (company?.name as string | undefined) ?? "Be Care Compliant",
        stage: m.stage as number,
        meetingDate: m.meeting_date as string,
        timeHHMM: String(m.meeting_time).slice(0, 5),
        duration: (m.duration_minutes as number | null) ?? 60,
        location,
        locationKind: location === "Microsoft Teams" ? "teams" : "office",
        employee: { profileId: (person.profile_id as string | null) ?? null, name: person.full_name as string, email: employeeEmail },
        conductor: {
          id: conductor.id as string,
          name: ((conductor.full_name as string | null) || (conductor.email as string)) ?? "",
          email: (conductor.email as string | null) ?? null,
        },
        rearranged: false,
        letterDateIso: bookedOn,
      };
      const { invitation, logoDataUrl } = await buildMeetingLetters(args);
      const pdf = await renderInvitationLetterPdf({ letter: invitation, logoDataUrl, notice: REBUILT_NOTICE });
      const sender = booker ?? conductor;
      const kept = await keepMeetingLetter({
        companyId: opts.companyId,
        branchId: args.branchId,
        personId: args.personId,
        meetingId: args.meetingId,
        kind: "invite",
        stage: args.stage,
        meetingDate: args.meetingDate,
        meetingTime: args.timeHHMM,
        subject: invitation.reLine.replace(/^RE:\s*/, ""),
        letterText: invitation.plainText,
        pdf,
        emailedTo: employeeEmail,
        sendOutcome: "sent before copies were kept",
        sentBy: { id: sender.id as string, name: ((sender.full_name as string | null) || (sender.email as string | null)) ?? null },
        rebuilt: true,
      });
      if (!kept.ok) console.error("[absence] automatic invitation copy not made", { meetingId: m.id, error: kept.error });
    }
  } catch (e) {
    console.error("[absence] automatic invitation copies failed", { error: (e as Error).message });
  }
}
