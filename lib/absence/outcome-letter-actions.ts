"use server";

/**
 * Be Care Compliant — the absence meeting outcome letter (Phil, 2026-09-29, Absence round 2 item 3).
 *
 *   draftOutcomeLetter    AI writes the middle from the meeting's Evidence. Saved at once, so
 *                         reopening never spends a second credit.
 *   previewOutcomeLetter  the whole letter, exactly as it will be emailed, read only. Sends nothing.
 *   sendOutcomeLetter     Approve and send: the PDF is made and kept on the meeting, and the letter
 *                         is emailed with the PDF attached. No email address: PDF only, marked not
 *                         emailed, for the manager to print and hand over.
 *
 * The company's fixed wording (opening, right of appeal, sign off) is Settings, Letters,
 * "Absence meeting outcome", and wraps the middle through {{outcome_body}}.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { runAi } from "@/lib/ai/anthropic";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import type { LetterPreviewState } from "@/lib/absence/letter-preview";
import { profilesById } from "@/lib/auth/company-profiles";
import { getAbsenceConfig } from "@/lib/absence/data";
import { stageActionFor } from "@/lib/absence/stage-actions";
import { letterWordingFor } from "@/lib/letters/data";
import { renderLetterHtml, renderLetterSubject } from "@/lib/letters/letters";
import { noticeEmailHtml } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";
import { claimNotification, releaseNotification, settleNotification } from "@/lib/notifications/log";
import { outcomeLetterPath, sha256Hex, uploadOutcomeLetter } from "@/lib/evidence/storage";
import { renderOutcomeLetterPdf } from "@/lib/absence/outcome-letter-pdf";
import { companyMeetingName, loadLetterExtras, stageLabelFor } from "@/lib/absence/letter-extras";
import { meetingNameAsTitle } from "@/lib/absence/meeting-name";
import {
  absenceLine,
  appealDays,
  letterDate,
  buildOutcomeLetterDoc,
  letterBodyParagraphs,
  type OutcomeLetterDoc,
} from "@/lib/absence/invitation-letter";
import { discussedAbsences } from "@/lib/absence/meeting-questions";
import { windowLabel } from "@/lib/absence/window";
import { windowStartIso } from "@/lib/absence/discount";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import {
  OUTCOME_SYSTEM,
  buildOutcomePrompt,
  cleanOutcomeBody,
  clipText,
  joinLetterParagraphs,
  OUTCOME_BODY_LIMIT,
  absencesBlock,
  isNoFurtherAction,
  stageAfterMeeting,
  stageFacts,
  letterParagraphs,
  normaliseApprovedBody,
  outcomeFacts,
  slashDate,
} from "@/lib/absence/outcome-letter";
import { redactName } from "@/lib/absence/meeting-questions";
import { stageFrom } from "@/lib/absence/record-meeting";

type Client = Awaited<ReturnType<typeof createClient>>;

type Loaded = {
  supabase: Client;
  companyId: string;
  companyName: string;
  meeting: {
    id: string;
    branch_id: string | null;
    person_id: string;
    stage: number | null;
    meeting_date: string | null;
    meeting_time: string | null;
    duration_minutes: number | null;
    location: string | null;
    evidence_id: string;
    conducted_by: string | null;
    recorded_by: string | null;
    /** The stage they are on after it, as decided when it was recorded (0423, 0433); null when the
     *  meeting predates that, or no stage. */
    stage_after: number | null;
  };
  answers: Record<string, unknown>;
  /** A recorded meeting's letter counts absences as they stood on its day (absence recheck). */
  asOfIso?: string;
  discountedFrom?: string;
  personId: string;
  conductorId: string | null;
  employee: { name: string; email: string | null; profileId: string | null };
  conductorName: string;
  letter: {
    id: string;
    status: string;
    draft_body: string | null;
    approved_body: string | null;
  } | null;
};

async function load(meetingId: string, companyId: string): Promise<Loaded | { error: string }> {
  if (!meetingId) return { error: "Missing meeting." };
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, stage_after, meeting_date, meeting_time, duration_minutes, location, evidence_id, conducted_by, recorded_by")
    .eq("id", meetingId)
    .maybeSingle();
  if (!m || m.company_id !== companyId) return { error: "That meeting could not be found." };
  if (!m.evidence_id) return { error: "Record the meeting first, then write its outcome letter." };
  const { data: allowed } = await supabase.rpc("can_prepare_absence_meeting", { p_person_id: m.person_id });
  if (allowed !== true) return { error: "You cannot write letters for this person's meetings." };

  const [{ data: ev }, { data: person }, { data: company }, { data: letter }] = await Promise.all([
    supabase.from("evidence").select("answers").eq("id", m.evidence_id).maybeSingle(),
    supabase.from("people").select("full_name, work_email, profile_id").eq("id", m.person_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase.from("absence_outcome_letters").select("id, status, draft_body, approved_body").eq("meeting_id", meetingId).maybeSingle(),
  ]);
  const answers = ((ev as { answers?: Record<string, unknown> } | null)?.answers ?? {}) as Record<string, unknown>;

  let email = (person?.work_email as string | null) ?? null;
  const profiles = await profilesById([
    (person?.profile_id as string | null) ?? null,
    (m.conducted_by as string | null) ?? null,
    (m.recorded_by as string | null) ?? null,
  ]);
  if (!email && person?.profile_id) email = profiles.get(person.profile_id as string)?.email ?? null;
  const conductorName =
    (m.conducted_by ? profiles.get(m.conducted_by as string)?.name : null) ||
    (typeof answers.manager_conducting === "string" && answers.manager_conducting.trim()) ||
    (m.recorded_by ? profiles.get(m.recorded_by as string)?.name : null) ||
    "your manager";

  return {
    supabase,
    companyId,
    companyName: (company?.name as string | undefined) ?? "your employer",
    meeting: {
      id: m.id as string,
      branch_id: (m.branch_id as string | null) ?? null,
      person_id: m.person_id as string,
      stage: (m.stage as number | null) ?? null,
      meeting_date: (m.meeting_date as string | null) ?? null,
      meeting_time: (m.meeting_time as string | null) ?? null,
      duration_minutes: (m.duration_minutes as number | null) ?? null,
      location: (m.location as string | null) ?? null,
      evidence_id: m.evidence_id as string,
      conducted_by: (m.conducted_by as string | null) ?? null,
      recorded_by: (m.recorded_by as string | null) ?? null,
      stage_after: (m.stage_after as number | null) ?? null,
    },
    answers,
    asOfIso: (m.meeting_date as string | null) ?? undefined,
    discountedFrom: (m.meeting_date as string | null) ?? undefined,
    personId: m.person_id as string,
    conductorId: (m.conducted_by as string | null) ?? null,
    employee: {
      name: (person?.full_name as string | undefined) ?? "the employee",
      email,
      profileId: (person?.profile_id as string | null) ?? null,
    },
    conductorName,
    letter: (letter as Loaded["letter"]) ?? null,
  };
}

const FINAL = new Set(["sent", "not_emailed"]);

/** What the letter needs, from a recorded meeting or from a meeting form not saved yet. */
type LetterCtx = Pick<Loaded, "supabase" | "companyId" | "companyName" | "employee" | "conductorName" | "answers"> & {
  meeting: Pick<Loaded["meeting"], "stage" | "meeting_date" | "meeting_time" | "duration_minutes" | "location">;
  personId: string;
  /** The manager holding the meeting, for their role under the sign off. */
  conductorId: string | null;
  asOfIso?: string;
  discountedFrom?: string;
};

/** Build the whole letter: subject, email HTML and the plain paragraphs the PDF prints. */
/** Everything the letter merges, apart from the outcome itself. */
async function letterSetup(ctx: LetterCtx) {
  const [wording, extras, config] = await Promise.all([
    letterWordingFor(ctx.supabase, ctx.companyId, "absence_meeting_outcome"),
    loadLetterExtras({
      companyId: ctx.companyId,
      personId: ctx.personId,
      conductorId: ctx.conductorId ?? NO_ONE,
      asOfIso: ctx.asOfIso,
      countDiscountedFrom: ctx.discountedFrom,
    }),
    getAbsenceConfig(ctx.companyId),
  ]);
  // What the company calls these meetings (0408): "Stage 2 disciplinary hearing" for Thistle.
  const stageLabel = stageLabelFor(ctx.meeting.stage, extras.meetingName);
  /* Dates in the letter read like the rest of it, "1st October 2026", not 01/10/2026 (Phil,
     2026-10-08, the four stage test). */
  const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.meeting.meeting_date ?? ""))
    ? letterDate(String(ctx.meeting.meeting_date))
    : slashDate(ctx.meeting.meeting_date);
  const time = ctx.meeting.meeting_time ? String(ctx.meeting.meeting_time).slice(0, 5) : "";
  const todayIso = formatCivilDate(todayInLondon());
  const appealBy = typeof ctx.answers.appeal_heard_by === "string" ? ctx.answers.appeal_heard_by.trim() : "";
  const values: Record<string, string> = {
    recipient_name: ctx.employee.name,
    employee_name: ctx.employee.name,
    company_name: ctx.companyName,
    stage: ctx.meeting.stage ? String(ctx.meeting.stage) : "",
    stage_label: stageLabel,
    stage_action: stageActionFor(config, ctx.meeting.stage) ?? "",
    stage_action_sentence: "",
    conductor_name: ctx.conductorName,
    meeting_date: meetingDate,
    meeting_time: time,
    meeting_when: time ? `${meetingDate} at ${time}` : meetingDate,
    location: ctx.meeting.location ?? "",
    duration: ctx.meeting.duration_minutes ? `${ctx.meeting.duration_minutes} minutes` : "",
    outcome_body: "",
    letter_date: letterDate(todayIso),
    // Chosen in the meeting's Outcome section (Phil, 2026-10-07); seven days unless changed.
    appeal_days: appealDays(ctx.answers.appeal_days),
    appeal_manager: appealBy || "a manager",
  };
  return { wording, extras, config, values, stageLabel, todayIso };
}

function thresholdsOf(config: Awaited<ReturnType<typeof getAbsenceConfig>>) {
  return config.method === "stages"
    ? (config.thresholds as Array<{ stage: number | string; occasions?: number | null; action?: string | null }>)
        .filter((t) => typeof t.occasions === "number")
        .map((t) => ({ stage: Number(t.stage), occasions: Number(t.occasions), action: t.action ?? null }))
    : [];
}

/** Why this stage and what comes next, for the AI to write from. */
async function stageFactsFor(
  config: Awaited<ReturnType<typeof getAbsenceConfig>>,
  stage: number | null,
  companyId: string,
  stageAfter?: number | null,
  discountedAtMeeting = 0,
): Promise<string[]> {
  const meetingName = await companyMeetingName(companyId);
  return stageFacts({
    stage,
    thresholds: thresholdsOf(config),
    windowWords: windowLabel(config.window),
    label: (n) => stageLabelFor(n, meetingName),
    stageAfter,
    discountedAtMeeting,
  });
}

/** The highest stage held at an earlier recorded meeting in the rolling window (not this one). */
async function priorHeldStage(ctx: LetterCtx, excludeMeetingId: string | null): Promise<number | null> {
  const config = await getAbsenceConfig(ctx.companyId);
  const windowStart = windowStartIso(formatCivilDate(todayInLondon()), config.window);
  let q = ctx.supabase
    .from("absence_meetings")
    .select("id, stage, stage_after")
    .eq("person_id", ctx.personId)
    .not("evidence_id", "is", null)
    .gte("meeting_date", windowStart);
  if (excludeMeetingId) q = q.neq("id", excludeMeetingId);
  const { data } = await q;
  const stages = ((data ?? []) as Array<{ stage: number | null; stage_after: number | null }>).map(
    (m) => m.stage_after ?? m.stage ?? 0,
  );
  return stages.length ? Math.max(...stages) || null : null;
}

/** The stage they are on once this meeting is over, given the discounts it makes (Phil, 2026-10-07). */
async function stageAfterFor(
  ctx: LetterCtx,
  discountDates: string[],
  excludeMeetingId: string | null,
): Promise<number | null> {
  const { extras, config } = await letterSetup(ctx);
  const gone = new Set(discountDates);
  return stageAfterMeeting({
    stage: ctx.meeting.stage,
    outcome: typeof ctx.answers.meeting_outcome === "string" ? ctx.answers.meeting_outcome : "",
    warning: typeof ctx.answers.warning_issued === "string" ? ctx.answers.warning_issued : "",
    remaining: extras.absences.filter((a) => !gone.has(a.start_date)).length,
    priorHeld: await priorHeldStage(ctx, excludeMeetingId),
    thresholds: thresholdsOf(config),
    discounted: gone.size,
  });
}

/** The absences this meeting covers (its stage's), for the AI to write about and nothing else. */
async function coveredFact(ctx: LetterCtx): Promise<string[]> {
  const { extras, config } = await letterSetup(ctx);
  const covered = discussedAbsences(extras.absences, ctx.meeting.stage, thresholdsOf(config));
  if (covered.length === 0) return [];
  return [
    `The absences this meeting covered (write ONLY about these): ${covered.map(({ e }) => absenceLine(e)).join("; ")}`,
  ];
}

/**
 * THE WHOLE LETTER AS TEXT (Phil, 2026-10-07: the box and the PDF must match). The company's
 * wording with the AI's middle merged in, from the opening line to the appeal paragraph, without
 * Dear or the sign off (the layout adds those). This is what the manager edits, and what is sent.
 */
async function fullLetterText(
  ctx: LetterCtx,
  middle: string,
  discount?: { dates: string[]; whens: string[]; reason: string },
): Promise<string> {
  const { wording, values, extras, config } = await letterSetup(ctx);
  // Each absence the meeting covered, listed like the invitation letter (Phil, 2026-10-07).
  const covered = discussedAbsences(extras.absences, ctx.meeting.stage, thresholdsOf(config));
  const block = absencesBlock(
    covered.map(({ e }) => ({ line: absenceLine(e), startDate: e.start_date, when: letterDate(e.start_date) })),
    discount,
  );
  const withList = block ? `${block}\n\n${middle}` : middle;
  // No further action: no right of appeal paragraph (Phil, 2026-10-07).
  const nfa = isNoFurtherAction(ctx.answers.meeting_outcome);
  const paragraphs = letterParagraphs(wording.body, { ...values, outcome_body: withList }).filter(
    (p) => !nfa || !/right to appeal|appeal will be heard/i.test(p),
  );
  return joinLetterParagraphs(letterBodyParagraphs(paragraphs, ctx.employee.name)).slice(0, OUTCOME_BODY_LIMIT);
}

/** Build the whole letter from the text the manager approved: subject, email and the PDF's layout. */
async function compose(ctx: LetterCtx, letterText: string) {
  const { wording, extras, values, stageLabel, todayIso } = await letterSetup(ctx);
  const subject = renderLetterSubject(wording.subject, values) || `Outcome of your ${stageLabel}`;
  // Laid out like the invitation letter (Phil, 2026-10-07).
  const doc = buildOutcomeLetterDoc({
    companyName: ctx.companyName,
    letterheadAddress: extras.letterheadAddress,
    letterheadPhone: extras.letterheadPhone,
    letterDateIso: todayIso,
    recipientName: ctx.employee.name,
    recipientAddress: extras.homeAddress,
    stage: ctx.meeting.stage,
    meetingTitle: meetingNameAsTitle(extras.meetingName),
    conductorName: ctx.conductorName,
    conductorRole: extras.conductorRole,
    wordingParagraphs: letterParagraphs(letterText, {}),
  });
  const html = noticeEmailHtml({
    preheader: subject,
    heading: subject,
    bodyHtml: letterDocHtml(doc),
    footerNote: `This letter is attached as a PDF for you to keep. It is sent on behalf of ${ctx.companyName}.`,
  });
  return { subject, html, doc, logoDataUrl: extras.logoDataUrl };
}

/** An id no profile has, for a letter whose manager has no login: no role is found for them. */
const NO_ONE = "00000000-0000-0000-0000-000000000000";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The letter in the email body, in the same order as the PDF. */
function letterDocHtml(doc: OutcomeLetterDoc): string {
  const p = (t: string, style = "") =>
    `<p style="margin:0 0 10px 0;${style}">${t ? esc(t).replace(/\n/g, "<br>") : "&nbsp;"}</p>`;
  return [
    p(doc.date),
    p(doc.salutation),
    p(doc.reLine, "font-weight:700;"),
    ...doc.paragraphs.map((t) => p(t)),
    p([doc.signOff.closing, "", doc.signOff.name, doc.signOff.role ?? ""].filter((x, i) => i === 1 || x).join("\n")),
  ].join("");
}

/** AI drafts the middle of the letter. Returns the saved draft without spending when there is one. */
export async function draftOutcomeLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  // A send that failed hands back what was approved; otherwise the saved draft. Either way, free.
  const kept = ctx.letter?.approved_body || ctx.letter?.draft_body;
  if (kept) return { ok: "Drafted", data: { body: kept } };

  const config = await getAbsenceConfig(ctx.companyId);
  /* A MEETING ALREADY RECORDED (the absence recheck, 2026-10-08): its absences as they stood that
     day, the ones discounted at it marked, and the stage after it as decided when it was saved.
     Built from today's record it listed the wrong stage's absences and said nothing was discounted. */
  const { extras: asHeld } = await letterSetup(ctx);
  const discountedDates = asHeld.discountedHere.map((d) => d.start_date);
  const discount = discountedDates.length
    ? {
        dates: discountedDates,
        whens: discountedDates.map((d) => letterDate(d)),
        reason: asHeld.discountedHere.find((d) => d.reason)?.reason ?? "",
      }
    : undefined;
  const stageAfter = ctx.meeting.stage_after != null
    ? ctx.meeting.stage_after || null
    : await stageAfterFor(ctx, discountedDates, ctx.meeting.id);
  const result = await runAi({
    companyId: ctx.companyId,
    feature: "absence_outcome_letter",
    system: OUTCOME_SYSTEM,
    prompt: buildOutcomePrompt({
      stage: ctx.meeting.stage,
      stageAction: stageActionFor(config, ctx.meeting.stage),
      facts: [
        ...(await coveredFact(ctx)),
        ...outcomeFacts(ctx.answers),
        ...(await stageFactsFor(config, ctx.meeting.stage, ctx.companyId, stageAfter, discountedDates.length)),
      ].map((f) =>
        redactName(f, ctx.employee.name),
      ),
    }),
    // A detailed letter needs room (Phil, 2026-10-07: one stopped mid sentence at 1200), and one
    // that still runs out is refused and its credit given back, never handed over cut short.
    maxTokens: 3000,
    refuseIfCut: true,
  });
  if ("error" in result) return { error: result.error };
  const middle = cleanOutcomeBody(result.ok);
  if (!middle) return { error: "The AI's reply came back empty. Try again, or write the outcome yourself." };
  const body = await fullLetterText(ctx, middle, discount);

  if (ctx.letter) {
    await ctx.supabase
      .from("absence_outcome_letters")
      .update({ draft_body: body, drafted_by: profile.id, drafted_by_name: profile.full_name, drafted_at: new Date().toISOString() })
      .eq("id", ctx.letter.id);
  } else {
    const { error } = await ctx.supabase.from("absence_outcome_letters").insert({
      company_id: ctx.companyId,
      person_id: ctx.meeting.person_id,
      branch_id: ctx.meeting.branch_id,
      meeting_id: ctx.meeting.id,
      evidence_id: ctx.meeting.evidence_id,
      draft_body: body,
      drafted_by: profile.id,
      drafted_by_name: profile.full_name,
      drafted_at: new Date().toISOString(),
    });
    if (error) {
      // Two people at once: the first draft wins and both see it.
      const { data: won } = await ctx.supabase
        .from("absence_outcome_letters")
        .select("draft_body")
        .eq("meeting_id", ctx.meeting.id)
        .maybeSingle();
      if (won?.draft_body) return { ok: "Drafted", data: { body: won.draft_body as string } };
    }
  }
  return { ok: "Drafted", data: { body } };
}

/** The whole letter as it will go, read only. Nothing is saved or sent. */
export async function previewOutcomeLetter(formData: FormData): Promise<LetterPreviewState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the outcome, or draft it, before checking the letter." };
  const letter = await compose(ctx, body);
  return {
    letters: [
      {
        key: "employee",
        who: "Employee",
        name: ctx.employee.name,
        to: ctx.employee.email,
        subject: letter.subject,
        html: letter.html,
        note: ctx.employee.email
          ? "The letter as a PDF, which is also kept on the meeting."
          : null,
        unsentNote: ctx.employee.email
          ? undefined
          : `${ctx.employee.name} has no email address, so this letter will not be emailed. Approving keeps it as a PDF on the meeting, marked not emailed, for you to print and hand to them.`,
      },
    ],
  };
}

/** Approve and send. Final: once it has gone it cannot be changed. */
export async function sendOutcomeLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the outcome, or draft it, before sending the letter." };

  // A letter written by hand with no draft behind it still needs its row.
  let letterId = ctx.letter?.id ?? null;
  if (!letterId) {
    const { data, error } = await ctx.supabase
      .from("absence_outcome_letters")
      .insert({
        company_id: ctx.companyId,
        person_id: ctx.meeting.person_id,
        branch_id: ctx.meeting.branch_id,
        meeting_id: ctx.meeting.id,
        evidence_id: ctx.meeting.evidence_id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `The letter could not be saved: ${error?.message ?? "no id"}` };
    letterId = data.id as string;
  }

  const letter = await compose(ctx, body);
  const letterText = letter.doc.plainText;

  // The PDF first: it is the copy kept on the meeting whatever happens to the email.
  let pdf: Buffer;
  try {
    pdf = await renderOutcomeLetterPdf({ letter: letter.doc, logoDataUrl: letter.logoDataUrl });
  } catch (e) {
    return { error: `The letter's PDF could not be made: ${(e as Error).message}` };
  }
  const path = outcomeLetterPath(ctx.companyId, ctx.meeting.evidence_id);
  const up = await uploadOutcomeLetter(path, pdf);
  if (!up.ok) return { error: `The letter's PDF could not be stored: ${up.error}` };

  let status: "sent" | "not_emailed" | "send_failed" = "not_emailed";
  let emailError: string | null = null;
  if (ctx.employee.email) {
    const logId = await claimNotification({
      companyId: ctx.companyId,
      branchId: ctx.meeting.branch_id,
      recipientProfileId: ctx.employee.profileId,
      channel: "email",
      kind: "absence_outcome_letter",
      dedupeKey: `absence_outcome_letter:${ctx.meeting.id}`,
      toAddress: ctx.employee.email,
      subject: letter.subject,
    });
    if (!logId) {
      status = "send_failed";
      emailError = "This letter is already being sent. Wait a moment and refresh.";
    } else {
      const result = await sendEmail({ companyId: ctx.companyId,
        to: ctx.employee.email,
        subject: letter.subject,
        html: letter.html,
        attachments: [
          { filename: "outcome-letter.pdf", content: pdf.toString("base64"), contentType: "application/pdf" },
        ],
      });
      if (result.sent) {
        status = "sent";
        await settleNotification(logId, "sent");
      } else if (result.skippedReason && !/RESEND/.test(result.skippedReason)) {
        /* NOT SENT ON PURPOSE (the absence recheck, 2026-10-08): a test company, or an address that
           can never be sent to. Trying again changes nothing, so it is kept as a PDF, marked not
           emailed, and the message says why without "try again". */
        status = "not_emailed";
        emailError = result.skippedReason;
        await releaseNotification(logId);
      } else {
        status = "send_failed";
        emailError = result.skippedReason
          ? "Email is not set up for this service (RESEND_API_KEY / RESEND_FROM)."
          : `The email could not be sent: ${result.error ?? "unknown error"}`;
        // Given back so Approve and send can try again; the attempt is in the audit log below.
        await releaseNotification(logId);
      }
    }
  }

  /* A COPY TO WHOEVER SENT IT (Phil, 2026-10-08): the same email, PDF attached, to the manager who
     pressed Approve and send, so they have exactly what the employee received. Only once the
     employee's copy has gone; a copy that fails never fails the send, it is said in the message. */
  let copyNote = "";
  const senderEmail = (profile.email ?? "").trim();
  if (status === "sent" && senderEmail && senderEmail.toLowerCase() !== (ctx.employee.email ?? "").toLowerCase()) {
    const copyLog = await claimNotification({
      companyId: ctx.companyId,
      branchId: ctx.meeting.branch_id,
      recipientProfileId: profile.id,
      channel: "email",
      kind: "absence_outcome_letter_copy",
      dedupeKey: `absence_outcome_letter_copy:${ctx.meeting.id}`,
      toAddress: senderEmail,
      subject: `Copy: ${letter.subject}`,
    });
    if (copyLog) {
      const copy = await sendEmail({
        companyId: ctx.companyId,
        to: senderEmail,
        subject: `Copy: ${letter.subject}`,
        html: letter.html,
        attachments: [
          { filename: "outcome-letter.pdf", content: pdf.toString("base64"), contentType: "application/pdf" },
        ],
      });
      if (copy.sent) {
        await settleNotification(copyLog, "sent");
        copyNote = ` A copy has been sent to you at ${senderEmail}.`;
      } else {
        await releaseNotification(copyLog);
        copyNote = " Your own copy could not be emailed; download the PDF from the meeting if you need it.";
      }
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await ctx.supabase
    .from("absence_outcome_letters")
    .update({
      status,
      approved_body: body,
      subject: letter.subject,
      letter_text: letterText,
      approved_by: profile.id,
      approved_by_name: profile.full_name,
      approved_at: now,
      emailed_to: status === "sent" ? ctx.employee.email : null,
      emailed_at: status === "sent" ? now : null,
      email_error: emailError,
      pdf_path: path,
      pdf_sha256: sha256Hex(pdf),
    })
    .eq("id", letterId);
  if (updErr) return { error: `The letter went out but could not be recorded: ${updErr.message}` };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: status === "sent" ? "absence.outcome_letter_sent" : status === "not_emailed" ? "absence.outcome_letter_kept" : "absence.outcome_letter_failed",
    entityType: "person",
    entityId: ctx.meeting.person_id,
    summary:
      status === "sent"
        ? `Sent the outcome letter for the ${ctx.meeting.stage ? `Stage ${ctx.meeting.stage} ` : ""}absence meeting to ${ctx.employee.email}`
        : status === "not_emailed"
          ? `Kept the absence meeting outcome letter as a PDF to hand over (${emailError ? "not sent: " + emailError : "no email address"})`
          : "The absence meeting outcome letter could not be emailed",
    metadata: { meeting_id: ctx.meeting.id, letter_id: letterId, status, error: emailError, copy_to: copyNote.startsWith(" A copy") ? senderEmail : null },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${ctx.meeting.person_id}`);
  if (status === "send_failed") {
    return { error: `The PDF is kept on the meeting, but ${emailError?.replace(/^The email/, "the email") ?? "the email could not be sent"} Press Approve and send to try again.` };
  }
  return {
    ok:
      status === "sent"
        ? `Letter sent to ${ctx.employee.email}, with the PDF attached. The PDF is kept on the meeting.${copyNote}`
        : emailError
          ? `Letter kept as a PDF on the meeting, marked not emailed. ${emailError} Download it to print and hand over.`
          : "Letter kept as a PDF on the meeting, marked not emailed. Download it to print and hand over.",
  };
}

/* ---------------------------------------------------------------------------------------------
 * GENERATE OUTCOME INSIDE THE MEETING FORM (Phil, 2026-10-07): once the meeting form is filled
 * in, Generate outcome at the bottom writes the letter from what is on screen, with the real PDF
 * beside it, before the meeting is saved. Save meeting keeps the words as the meeting's draft
 * letter, and Approve and send follows as before. Nothing here saves anything.
 * ------------------------------------------------------------------------------------------- */

async function loadFromForm(
  formData: FormData,
  companyId: string,
): Promise<{ ctx: LetterCtx; answers: Record<string, unknown> } | { error: string }> {
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) return { error: "Missing person." };
  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { error: "Could not read the meeting form." };
  }
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("id, company_id, full_name, work_email, profile_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person || person.company_id !== companyId) return { error: "That record could not be found." };
  const { data: allowed } = await supabase.rpc("can_prepare_absence_meeting", { p_person_id: personId });
  if (allowed !== true) return { error: "You cannot write letters for this person's meetings." };

  // The booking this form is recording, when there is one: its time, place and length.
  const meetingId = String(formData.get("meeting_id") ?? "").trim();
  let booking: { meeting_time: string | null; duration_minutes: number | null; location: string | null; conducted_by: string | null } | null = null;
  if (meetingId) {
    const { data: b } = await supabase
      .from("absence_meetings")
      .select("person_id, meeting_time, duration_minutes, location, evidence_id, conducted_by")
      .eq("id", meetingId)
      .maybeSingle();
    if (b && b.person_id === personId && !b.evidence_id) {
      booking = {
        meeting_time: (b.meeting_time as string | null) ?? null,
        duration_minutes: (b.duration_minutes as number | null) ?? null,
        location: (b.location as string | null) ?? null,
        conducted_by: (b.conducted_by as string | null) ?? null,
      };
    }
  }
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  let email = (person.work_email as string | null) ?? null;
  if (!email && person.profile_id) {
    email = (await profilesById([person.profile_id as string])).get(person.profile_id as string)?.email ?? null;
  }
  const date = typeof answers.date_of_meeting === "string" ? answers.date_of_meeting : null;
  const conductor = typeof answers.manager_conducting === "string" ? answers.manager_conducting.trim() : "";
  // Their login, for the role under the sign off: the booking's, or the person of that name.
  let conductorId = booking?.conducted_by ?? null;
  if (!conductorId && conductor) {
    const { data: byName } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("full_name", conductor)
      .limit(1)
      .maybeSingle();
    conductorId = (byName?.id as string | undefined) ?? null;
  }
  return {
    answers,
    ctx: {
      supabase,
      companyId,
      answers,
      personId,
      conductorId,
      companyName: (company?.name as string | undefined) ?? "your employer",
      employee: {
        name: (person.full_name as string | undefined) ?? "the employee",
        email,
        profileId: (person.profile_id as string | null) ?? null,
      },
      conductorName: conductor || "your manager",
      meeting: {
        stage: stageFrom(answers.meeting_type),
        meeting_date: date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date : null,
        meeting_time: booking?.meeting_time ?? null,
        duration_minutes: booking?.duration_minutes ?? null,
        location: booking?.location ?? null,
      },
    },
  };
}

/** Generate outcome: the AI writes the middle of the letter from the meeting form on screen. */
export async function draftOutcomeFromForm(formData: FormData): Promise<{ body?: string; error?: string }> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const loaded = await loadFromForm(formData, profile.company_id);
  if ("error" in loaded) return { error: loaded.error };
  const facts = outcomeFacts(loaded.answers);
  // Absences ticked in the form as not counting (Phil, 2026-10-07), so the letter can say so.
  const discountNote = clipText(formData.get("discount_note"), 600);
  if (discountNote) facts.push(`Absences the meeting agreed to discount, so they no longer count: ${discountNote}`);
  if (!facts.some((f) => f.startsWith("Outcome of the meeting:"))) {
    return { error: "Fill in the outcome of the meeting first, then generate the letter." };
  }
  const config = await getAbsenceConfig(profile.company_id);
  const stage = loaded.ctx.meeting.stage;
  // Absences ticked to discount in the form (Phil, 2026-10-07): marked in the list and explained,
  // and they decide the stage the employee is on after the meeting.
  const dates = String(formData.get("discount_dates") ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const stageAfter = await stageAfterFor(loaded.ctx, dates, null);
  const result = await runAi({
    companyId: profile.company_id,
    feature: "absence_outcome_letter",
    system: OUTCOME_SYSTEM,
    prompt: buildOutcomePrompt({
      stage,
      stageAction: stageActionFor(config, stage),
      // The employee's name never goes to the AI: reasons and notes are often written with it.
      facts: [
        ...(await coveredFact(loaded.ctx)),
        ...facts,
        ...(await stageFactsFor(config, stage, profile.company_id, stageAfter, dates.length)),
      ].map(
        (f) => redactName(f, loaded.ctx.employee.name),
      ),
    }),
    // A detailed letter needs room (Phil, 2026-10-07: one stopped mid sentence at 1200), and one
    // that still runs out is refused and its credit given back, never handed over cut short.
    maxTokens: 3000,
    refuseIfCut: true,
  });
  if ("error" in result) return { error: result.error };
  const middle = cleanOutcomeBody(result.ok);
  if (!middle) return { error: "The AI's reply came back empty. Try again, or write the outcome yourself." };
  const reason = clipText(formData.get("discount_reason"), 500);
  return { body: await fullLetterText(
      loaded.ctx,
      middle,
      dates.length ? { dates, whens: [...dates].sort().map(letterDate), reason } : undefined,
    ) };
}

/** The real PDF of the whole letter, for the preview beside the words. Saves and sends nothing. */
export async function previewOutcomePdfFromForm(formData: FormData): Promise<{ pdf?: string; error?: string }> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const loaded = await loadFromForm(formData, profile.company_id);
  if ("error" in loaded) return { error: loaded.error };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the outcome, or generate it, to see the letter." };
  try {
    const letter = await compose(loaded.ctx, body);
    const pdf = await renderOutcomeLetterPdf({ letter: letter.doc, logoDataUrl: letter.logoDataUrl });
    return { pdf: pdf.toString("base64") };
  } catch (e) {
    return { error: `The preview could not be made: ${(e as Error).message}` };
  }
}

/**
 * THE FINAL LOOK (Phil, 2026-10-07: "a final chance to see the pdf then approve and send or save to
 * file or return and edit"). The real PDF of the whole letter for a recorded meeting, and who it
 * will be emailed to. With download set, it is the copy the manager saves to file, and the audit
 * log says so. Nothing is sent and the letter stays a draft.
 */
export async function outcomeLetterPdfPreview(
  formData: FormData,
): Promise<{ pdf?: string; to?: string | null; name?: string; fileName?: string; error?: string }> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the letter, or generate it, first." };
  try {
    const letter = await compose(ctx, body);
    const pdf = await renderOutcomeLetterPdf({ letter: letter.doc, logoDataUrl: letter.logoDataUrl });
    if (String(formData.get("download") ?? "") === "1") {
      await writeAudit({
        companyId: ctx.companyId,
        actorId: user.id,
        actorEmail: profile.email,
        actorRole: profile.role,
        action: "absence.outcome_letter_downloaded",
        entityType: "person",
        entityId: ctx.meeting.person_id,
        summary: "Saved the absence meeting outcome letter to file (not sent)",
        metadata: { meeting_id: ctx.meeting.id },
      });
    }
    return {
      pdf: pdf.toString("base64"),
      to: ctx.employee.email,
      name: ctx.employee.name,
      fileName: `Outcome letter ${ctx.employee.name}${ctx.meeting.meeting_date ? ` ${ctx.meeting.meeting_date}` : ""}.pdf`.replace(/[\\/:*?"<>|]/g, ""),
    };
  } catch (e) {
    return { error: `The letter could not be prepared: ${(e as Error).message}` };
  }
}
