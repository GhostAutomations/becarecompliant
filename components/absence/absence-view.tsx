"use client";

/**
 * Be Care Compliant — Absence view (People sub-section).
 * Branch cards for ONLY the people who have absences recorded, each showing
 * their current stage / action (derived by lib/absence/logic from the rolling
 * window) and whether a formal meeting is due. Recording an absence or a meeting
 * completes the matching founder Form and stores immutable Evidence.
 */

import RecordTypeahead from "@/components/register/record-typeahead";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FormEvidenceDialog from "@/components/forms/form-evidence-dialog";
import AbsenceDetailDialog from "@/components/absence/absence-detail-dialog";
import BookMeetingDialog from "@/components/absence/book-meeting-dialog";
import CancelRearrangeDialog from "@/components/absence/cancel-rearrange-dialog";
import OutcomeLetterDialog from "@/components/absence/outcome-letter-dialog";
import OutcomeInForm from "@/components/absence/outcome-in-form";
import DiscountInForm from "@/components/absence/discount-in-form";
import { stageActionFor, stageActionLines } from "@/lib/absence/stage-actions";
import type { FormSchema } from "@/lib/form-schema";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import type { AbsenceMethod, StageThreshold } from "@/lib/absence/logic";
import type { AbsencePersonRow, PersonLite, AbsenceEventRow, OpenBookingRow, ConductorLite, MeetingOffice } from "@/lib/absence/data";
import type { BranchLite } from "@/lib/people/data";
import { recordAbsence, recordAbsenceMeeting } from "@/lib/absence/actions";
import { availableStages, recordableStages } from "@/lib/absence/record-meeting";
import { DEFAULT_APPEAL_DAYS } from "@/lib/absence/invitation-letter";
import { fieldToNameSelect, removeField } from "@/lib/form-schema";
import { countedAbsences } from "@/lib/absence/discount";
import { discussedAbsences } from "@/lib/absence/meeting-questions";
import { draftMeetingQuestions } from "@/lib/absence/meeting-questions-actions";
import type { AiQuestion } from "@/lib/forms";
import { draftReturnToWork, recordReturnToWork } from "@/lib/absence/rtw-actions";
import type { OutstandingRtw } from "@/lib/absence/rtw";
import type { RtwQuestionnaire } from "@/lib/absence/rtw-questions-data";
import { rtwQuestionsPill } from "@/lib/absence/rtw-questions";
import RtwSendPanel from "@/components/absence/rtw-send-panel";
import { rtwFromSearch, viewFromSearch } from "@/lib/absence/rtw-list";
import { absenceRank, rankAbsenceRows, type RankInput } from "@/lib/absence/rank";
import { useBranchWord } from "@/components/branches/branch-word";

/** The card shows the office NAME, not the full address (Phil, 2026-07-12):
 *  "Cardiff Branch Office", "Acme Care Company Office" or "Teams". The full
 *  address still prints in the letters and the calendar entry. */
function locationLabel(location: string, offices: MeetingOffice[]): string {
  if (location === "Microsoft Teams") return "Teams";
  return offices.find((o) => o.address && o.address === location)?.label ?? location;
}

/** 15/07/2026 from 2026-07-15, for the absence list in the meeting form. */
function formatSlashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** 15 Jul 2026 from 2026-07-15, for the booked-meeting line. */
function formatBookedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AbsenceView({
  method,
  stageThresholds,
  rows,
  branches,
  branchNames,
  people,
  events,
  absenceSchema,
  meetingSchema,
  rtwSchema,
  currentUserName,
  outstandingRtw,
  rtwQuestionnaires,
  meetingQuestions,
  openBookings,
  conductors,
  offices,
  canManage,
  canDiscount,
  windowStart,
}: {
  method: AbsenceMethod;
  /** Stage occasions thresholds (stages method), for scoping which absences a
   *  Stage N meeting discusses. Empty for Bradford. */
  stageThresholds: StageThreshold[];
  rows: AbsencePersonRow[];
  /** What the viewer may CHOOSE. Narrowed to the branches she can act in. */
  branches: BranchLite[];
  /** What the app may SHOW. Every branch in the company, because a register read through RLS
   *  can contain a row from a branch she cannot act in and that row still needs a label. */
  branchNames: BranchLite[];
  people: PersonLite[];
  events: AbsenceEventRow[];
  absenceSchema: FormSchema | null;
  meetingSchema: FormSchema | null;
  rtwSchema: FormSchema | null;
  /** Who is filling this in, as the SAME string migration 0144 bakes into the
   *  conducted_by options (trimmed full name, falling back to email). It must match an
   *  option exactly or the server rejects the answer on save. */
  currentUserName: string;
  outstandingRtw: OutstandingRtw[];
  /** Saved Return to Work questions (0331), keyed by absence id. */
  rtwQuestionnaires: Record<string, RtwQuestionnaire>;
  /** Drafted meeting questions not yet asked (0342): "meeting:<booking id>" or "person:<id>". */
  meetingQuestions: Record<string, AiQuestion[]>;
  openBookings: OpenBookingRow[];
  conductors: ConductorLite[];
  offices: MeetingOffice[];
  canManage: boolean;
  /** Managers and above: discount absences (0328). */
  canDiscount: boolean;
  /** First date inside the rolling window (Europe/London today less the window). */
  windowStart: string;
}) {
  const bw = useBranchWord();
  const [branch, setBranch] = useState("");
  const [pickPerson, setPickPerson] = useState("");
  const [pickQuery, setPickQuery] = useState("");

  /* After Save meeting the outcome letter is offered (Phil, 2026-09-29). Discounting moved into the
     meeting form itself (Phil, 2026-10-07). */
  const [letterFor, setLetterFor] = useState<{ meetingId: string; personName: string; initialBody?: string | null; leaverHref?: string | null } | null>(null);
  /* The outcome generated in each person's meeting form (Phil, 2026-10-07), so the letter step after
     Save meeting opens on those words. */
  const formOutcome = useRef<Record<string, string>>({});
  const closeLetter = useCallback(() => setLetterFor(null), []);

  /* A dashboard Return to Work row links here with ?rtw=<absence id>: open that interview's
     form, then drop the parameter so a refresh does not open it again. */
  const [openRtwId, setOpenRtwId] = useState<string | null>(null);
  /* A dashboard "Add last date" row links here with ?view=<person id>: open that person's
     View absence, where the last date is entered. */
  const [openViewPersonId, setOpenViewPersonId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const id = rtwFromSearch(window.location.search);
      const viewId = viewFromSearch(window.location.search);
      if (!id && !viewId) return;
      if (id) setOpenRtwId(id);
      if (viewId) setOpenViewPersonId(viewId);
      const url = new URL(window.location.href);
      url.searchParams.delete("rtw");
      url.searchParams.delete("view");
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {
      // No window: nothing to open.
    }
  }, []);

  const eventsByPerson = useMemo(() => {
    const map: Record<string, AbsenceEventRow[]> = {};
    for (const e of events) (map[e.person_id] ??= []).push(e);
    return map;
  }, [events]);

  // Stage actions from Settings, Absence (Phil, 2026-09-29): shown when booking, and listed as
  // help on the meeting form's warning question. The server enforces the same limit.
  const stageActionMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of stageThresholds) {
      const a = stageActionFor({ method: "stages", thresholds: stageThresholds }, Number(t.stage));
      if (a) map[Number(t.stage)] = a;
    }
    return map;
  }, [stageThresholds]);
  const policyLines = useMemo(
    () => stageActionLines({ method: "stages", thresholds: stageThresholds }),
    [stageThresholds],
  );

  // Earliest open booking per person (a booked meeting awaiting recording).
  const bookingByPerson = useMemo(() => {
    const map: Record<string, OpenBookingRow> = {};
    for (const b of openBookings) map[b.person_id] ??= b;
    return map;
  }, [openBookings]);

  // ALL open bookings per person: the Record meeting form's Meeting Type only
  // offers booked stages, and its details prefill from the booking (Phil,
  // 2026-07-12). openBookings is date-ordered, so [0] is the earliest.
  const allBookingsByPerson = useMemo(() => {
    const map: Record<string, OpenBookingRow[]> = {};
    for (const b of openBookings) (map[b.person_id] ??= []).push(b);
    return map;
  }, [openBookings]);

  /** Personalised Record meeting schema + prefills for one person. */
  function meetingFormFor(r: AbsencePersonRow): {
    schema: FormSchema | null;
    presets: Record<string, string>;
    /** The booking this Record meeting is for, if any: the drafted questions are kept on it. */
    bookingId: string | null;
    /** The absences this meeting covers (its stage's), oldest first. */
    covered: AbsenceEventRow[];
  } {
    if (!meetingSchema) return { schema: null, presets: {}, bookingId: null, covered: [] };
    // Declined means NOT booked in (Phil, 2026-07-12): declined bookings do
    // not appear as Meeting Type options and do not drive the prefills. The
    // manager rearranges (which resets the response) or cancels them.
    const bookings = (allBookingsByPerson[r.personId] ?? []).filter(
      (b) => b.response !== "declined",
    );
    const bookedStages = bookings
      .map((b) => b.stage)
      .filter((s): s is number => s !== null);
    const earliest = bookings[0];

    // The Record meeting button ALWAYS shows (Phil, 2026-07-12). When something is booked,
    // Meeting Type offers the booked stages. When NOTHING is booked it offers all four, for a
    // meeting that was held without being booked here (DEF-072, Phil 2026-09-24: "Allow a
    // meeting already held"); the server then insists the date is today or earlier, and no
    // letter or invite is sent.
    const nothingBooked = bookedStages.length === 0;
    /* Nothing booked: the highest stage triggered is chosen to start with, and the absences listed
       are that stage's (Phil, 2026-10-08: when several stages are triggered the manager picks, the
       higher one chosen by default). */
    const triggered = r.status.triggeredStages ?? [];
    const defaultUnbooked = nothingBooked && triggered.length > 0 ? Math.max(...triggered) : null;
    const schema: FormSchema = {
      ...meetingSchema,
      sections: meetingSchema.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) =>
          f.key === "meeting_type" && "options" in f
            ? {
                ...f,
                options: recordableStages(
                  bookedStages,
                  availableStages(r.status.meetingStage, r.status.derivedStage),
                ).map((st) => ({
                  label: `Stage ${st}`,
                  value: `Stage ${st}`,
                })),
              }
            : f.key === "date_of_meeting" && nothingBooked
              ? { ...f, help: "The date the meeting was held. A meeting still to come is booked with Book meeting, so the employee gets their letter." }
              : f.key === "warning_issued" && policyLines.length > 0
                ? { ...f, help: `Your absence settings allow: ${policyLines.join(". ")}. A warning above the meeting's stage will not save.` }
                : f,
        ),
      })),
    };

    // One absence per line, numbered chronologically (Phil, 2026-07-12):
    //   Absence 1: 10/07/2026
    //   Absence 2: 11/08/2026 to 13/08/2026
    // A Stage N meeting only discusses ITS absences (Phil): Stage 1 covers the
    // occasions up to its trigger threshold; each later stage covers the new
    // absences since the previous stage's threshold. Numbers stay absolute.
    // Discounted absences are not what a meeting discusses (0328). They stay on the record
    // but leave this list and its numbering.
    // Absences outside the rolling window no longer count either, so they are not discussed
    // (2026-09-29: this list used every absence ever recorded, which would have put a Stage 1 onto
    // absences from years ago). The same rule the drafted questions use: discussedAbsences.
    const chronological = countedAbsences(eventsByPerson[r.personId] ?? [], { windowStart });
    const bookedStage = earliest?.stage ?? defaultUnbooked;
    const discussed = discussedAbsences(
      chronological,
      bookedStage,
      stageThresholds
        .filter((t) => typeof t.occasions === "number")
        .map((t) => ({ stage: Number(t.stage), occasions: Number(t.occasions) })),
    );
    const dates = discussed
      .map(({ e, n }) => {
        const range =
          e.end_date && e.end_date !== e.start_date
            ? `${formatSlashDate(e.start_date)} to ${formatSlashDate(e.end_date)}`
            : formatSlashDate(e.start_date);
        // The reason next to each date (Phil, 2026-10-07), as the absence recorded it.
        const reason = (e.reason ?? "").replace(/\s+/g, " ").trim();
        return `Absence ${n}: ${range}${reason ? `, ${reason}` : ""}`;
      })
      .join("\n");

    const presets: Record<string, string> = {
      purpose_of_meeting:
        "To discuss the employee's attendance record, review absence history, understand any underlying reasons for absence, and agree any appropriate actions and support measures.",
      // Names the stage and which absences it covers (Phil, 2026-10-07), so the count above and the
      // dates below plainly match: a Thistle Stage 2 covers only Absence 4.
      current_absence_level: `${r.occasions} ${r.occasions === 1 ? "occasion" : "occasions"}, ${r.totalDays} ${r.totalDays === 1 ? "day" : "days"} in the review period.${
        bookedStage && discussed.length > 0
          ? ` Stage ${bookedStage} covers ${
              discussed.length === 1
                ? `absence ${discussed[0].n}`
                : `absences ${discussed[0].n} to ${discussed[discussed.length - 1].n}`
            }.`
          : ""
      }`,
      dates_of_absence_discussed: dates,
    };
    if (!earliest && defaultUnbooked) presets.meeting_type = `Stage ${defaultUnbooked}`;
    if (earliest) {
      if (earliest.stage) presets.meeting_type = `Stage ${earliest.stage}`;
      if (earliest.conductor_name) presets.manager_conducting = earliest.conductor_name;
      if (earliest.meeting_date) presets.date_of_meeting = earliest.meeting_date;
    }
    // Manager conducting is a drop down of the people who can hold meetings, filled from the
    // booking (Phil, 2026-10-07: "an empty text box doesn't make any sense"). Render side only:
    // the answer is still the name as text, so the stored form version validates as before.
    // "Number of absences in review period" is gone from the tile (Phil, 2026-10-07): the current
    // absence level above it already says it. Render side only, like the name drop down.
    const managerSchema = fieldToNameSelect(
      removeField(schema, "number_of_absences"),
      "manager_conducting",
      conductors.map((c) => c.full_name),
      earliest?.conductor_name ?? null,
    );
    // Who hears an appeal (Phil, 2026-10-07): a drop down of the same people, leaving out whoever is
    // holding this meeting when anyone else can. The days to appeal default to seven.
    // Managers and above only: Supervisors hold meetings since 2026-10-08, but an appeal goes to
    // someone more senior than a Supervisor.
    const appealPool = conductors.filter((c) => c.role !== "supervisor");
    const appealNames = appealPool
      .map((c) => c.full_name)
      .filter((n) => n !== earliest?.conductor_name);
    const withAppeal = fieldToNameSelect(
      managerSchema,
      "appeal_heard_by",
      appealNames.length > 0 ? appealNames : appealPool.map((c) => c.full_name),
    );
    if (withAppeal.sections.some((sec) => sec.fields.some((f) => f.key === "appeal_days"))) {
      presets.appeal_days = DEFAULT_APPEAL_DAYS;
    }
    return { schema: withAppeal, presets, bookingId: earliest?.id ?? null, covered: discussed.map(({ e }) => e) };
  }

  const rankInputFor = (r: AbsencePersonRow): RankInput => ({
    derivedStage: r.status.derivedStage,
    derivedLabel: r.status.derivedLabel,
    meetingDue: r.status.meetingDue,
    bradfordScore: r.status.bradfordScore,
    booking: bookingByPerson[r.personId] ?? null,
  });
  // Ranked: whoever needs a meeting booking first, booked meetings next, then stages already
  // dealt with, then everyone below threshold (Phil, 2026-10-06). lib/absence/rank.ts.
  const visibleRows = useMemo(
    () =>
      rankAbsenceRows(branch ? rows.filter((r) => r.branchId === branch) : rows, rankInputFor),
    [rows, branch, bookingByPerson],
  );
  const visiblePeople = useMemo(
    () => (branch ? people.filter((p) => p.branch_id === branch) : people),
    [people, branch],
  );
  // Labelled from the DISPLAY list, not the picker. Looking a name up in the narrowed picker
  // left a blank grey line where the branch should be, on exactly the rows 0183 exists to show.
  const branchName = (id: string | null) =>
    branchNames.find((b) => b.id === id)?.name ?? "";
  /* The people the name picker offers, A to Z, each with their branch to tell two of the same
     name apart. */
  const personChoices = useMemo(
    () =>
      [...visiblePeople]
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "en-GB", { sensitivity: "base" }))
        .map((p) => ({ id: p.id, label: p.full_name, hint: branchName(p.branch_id) || undefined })),
    // branchName reads branchNames, which only changes with the page's props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiblePeople, branchNames],
  );

  /** Today in Europe/London, for the Return to Work interview date. Computed from the
   *  shared recurrence helpers so there is one definition of "today" in the app, and
   *  identical on the server and the client because the timezone is explicit. */
  const londonToday = formatCivilDate(todayInLondon());

  /** Outstanding Return to Work interviews, respecting the branch filter and with
   *  overdue ones first. Branch is matched by name, which is what the reader returns. */
  const visibleRtw = useMemo(() => {
    const wanted = branch ? branches.find((b) => b.id === branch)?.name ?? "" : "";
    const list = wanted ? outstandingRtw.filter((r) => r.branchName === wanted) : outstandingRtw;
    return [...list].sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.localeCompare(b.dueDate),
    );
  }, [outstandingRtw, branch, branches]);

  /** Preset "Interview conducted by" with whoever is filling it in, but ONLY when they
   *  are actually one of the baked options. The bake (migration 0144) excludes platform
   *  admins, so a founder or a manage-as session is not in the list, and presetting a
   *  value the schema does not offer fails the server validation on save. Better to
   *  leave it unchosen than to hand them an answer that cannot be saved. */
  const conductedByDefault = useMemo(() => {
    if (!rtwSchema || !currentUserName) return "";
    for (const section of rtwSchema.sections) {
      for (const field of section.fields) {
        if (field.key !== "conducted_by") continue;
        const allowed = (field.options ?? []).map((o) => o.value);
        return allowed.includes(currentUserName) ? currentUserName : "";
      }
    }
    return "";
  }, [rtwSchema, currentUserName]);

  /** dd/mm/yyyy, the format used everywhere the app shows a date to a manager. */
  const fmtDay = (iso: string | null): string => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };


  /* A TO Z BY FIRST NAME inside each section (Phil, 2026-10-07: "let's have them in alphabetical
     order because at the moment they're a bit all over the place"; popup: by first name). Which
     section a person is in is still decided by the ranking (lib/absence/rank.ts). */
  const byFirstName = (a: AbsencePersonRow, b: AbsencePersonRow) =>
    a.fullName.localeCompare(b.fullName, "en-GB", { sensitivity: "base" });
  const actionRows = visibleRows.filter((r) => absenceRank(rankInputFor(r)) <= 1).sort(byFirstName);
  const trackingRows = visibleRows.filter((r) => absenceRank(rankInputFor(r)) > 1).sort(byFirstName);

  /** One person's absence tile, the same in either section. */
  const renderCard = (r: AbsencePersonRow) => {
            const s = r.status;
            /* Every stage triggered and not yet held (Phil, 2026-10-08: "show all the stages that
               have been triggered"). */
            const triggeredList = (s.triggeredStages ?? []).map((n) => `Stage ${n}`);
            const several = triggeredList.length > 1;
            const pillLabel = several ? triggeredList.join(", ") : s.derivedLabel;
            const severalLine = several
              ? `${triggeredList.slice(0, -1).join(", ")} and ${triggeredList[triggeredList.length - 1]} have ${triggeredList.length === 2 ? "both" : "all"} been triggered.`
              : "";
            const pill =
              s.derivedStage != null && s.derivedStage >= 2
                ? "pill pill-red"
                : s.derivedLabel
                  ? "pill pill-amber"
                  : "pill pill-neutral";
            return (
              <div key={r.personId} className="glass-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/people/${r.personId}`}
                      className="truncate font-semibold text-white hover:text-gold-300"
                    >
                      {r.fullName}
                    </Link>
                    {branches.length > 1 && (
                      <p className="text-[11px] text-white/45">{branchName(r.branchId)}</p>
                    )}
                  </div>
                  <span className={pill}>{pillLabel ?? "Below threshold"}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">{r.occasions}</div>
                    <div className="text-white/50">occasions</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">{r.totalDays}</div>
                    <div className="text-white/50">days</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-base font-semibold text-white">
                      {/* The meeting they actually had (Phil, 2026-10-08), even when discounts put them back. */}
                      {method === "bradford" ? s.bradfordScore : s.lastHeldStage ?? s.meetingStage ?? "—"}
                    </div>
                    <div className="text-white/50">
                      {method === "bradford" ? "Bradford" : "last meeting"}
                    </div>
                  </div>
                </div>

                {r.notCounted > 0 && (
                  <p className="text-xs text-white/50">
                    {r.notCounted} discounted {r.notCounted === 1 ? "absence does" : "absences do"} not count.
                  </p>
                )}
                {s.action && <p className="text-xs text-white/70">Action: {s.action}</p>}
                {s.meetingDue && (
                  <p className="text-xs font-medium text-amber-300">
                    {several
                      ? severalLine
                      : s.dueAfterNewAbsence && s.meetingStage != null
                      ? `A ${s.derivedLabel ?? "stage"} meeting is due: a new absence since the Stage ${s.meetingStage} meeting.`
                      : `A ${s.derivedLabel ?? "stage"} meeting is due.`}
                  </p>
                )}
                {bookingByPerson[r.personId] && (
                  <div className="text-xs font-medium text-sky-300">
                    <p>
                      {bookingByPerson[r.personId].stage
                        ? `Stage ${bookingByPerson[r.personId].stage} meeting booked`
                        : "Meeting booked"}
                      {bookingByPerson[r.personId].meeting_date
                        ? `: ${formatBookedDate(bookingByPerson[r.personId].meeting_date!)}${bookingByPerson[r.personId].meeting_time ? ` at ${String(bookingByPerson[r.personId].meeting_time).slice(0, 5)}` : ""}`
                        : ""}
                      {bookingByPerson[r.personId].conductor_name
                        ? `, held by ${bookingByPerson[r.personId].conductor_name}`
                        : ""}
                      {bookingByPerson[r.personId].location
                        ? `, ${locationLabel(bookingByPerson[r.personId].location!, offices)}`
                        : ""}
                    </p>
                    {bookingByPerson[r.personId].response === "accepted" && (
                      <p className="text-emerald-300">Invitation accepted.</p>
                    )}
                    {bookingByPerson[r.personId].response === "declined" && (
                      <p className="text-red-300">
                        Invitation declined
                        {bookingByPerson[r.personId].response_reason
                          ? `: ${bookingByPerson[r.personId].response_reason}`
                          : "."}
                      </p>
                    )}
                  </div>
                )}

                {/* Two by two, full width, so a narrow card holds its buttons in tidy rows
                    instead of a ragged wrap. */}
                <div className="mt-auto grid grid-cols-2 gap-2 pt-1 [&>*]:w-full [&_button]:w-full">
                  {canManage && absenceSchema ? (
                      <FormEvidenceDialog
                        title={`Record absence for ${r.fullName}`}
                        schema={absenceSchema}
                        action={recordAbsence}
                        extraFields={{ person_id: r.personId }}
                        triggerLabel="Add absence"
                        triggerClassName="btn-outline px-3 py-1.5 text-xs"
                        submitLabel="Save absence"
                        hideFields={["name", "email"]}
                      />
                    ) : null}
                  <AbsenceDetailDialog
                    personName={r.fullName}
                    events={eventsByPerson[r.personId] ?? []}
                    canEdit={canManage}
                    canDiscount={canDiscount}
                    windowStart={windowStart}
                    openOnMount={openViewPersonId === r.personId}
                  />
                  {canManage ? (
                    <BookMeetingDialog
                      personId={r.personId}
                      personName={r.fullName}
                      defaultStage={Math.min(4, Math.max(1, ...(s.triggeredStages?.length ? s.triggeredStages : [(s.meetingStage ?? 0) + 1])))}
                      minStage={(s.meetingStage ?? 0) + 1}
                      maxStage={Math.max(0, ...availableStages(s.meetingStage, s.derivedStage))}
                      conductors={conductors}
                      offices={offices}
                      stageActions={stageActionMap}
                    />
                  ) : null}
                  {canManage && meetingSchema ? (
                      (() => {
                        const mf = meetingFormFor(r);
                        const savedQuestions =
                          meetingQuestions[mf.bookingId ? `meeting:${mf.bookingId}` : `person:${r.personId}`] ?? [];
                        return mf.schema ? (
                          <FormEvidenceDialog
                            title={`Absence meeting for ${r.fullName}`}
                            schema={mf.schema}
                            action={recordAbsenceMeeting}
                            extraFields={{ person_id: r.personId }}
                            initialAi={savedQuestions.length > 0 ? { questions: savedQuestions } : undefined}
                            questionsEditable
                            aiDraft={
                              mf.schema.sections.some((sec) => sec.fields.some((f) => f.key === "meeting_questions"))
                                ? {
                                    action: draftMeetingQuestions,
                                    label: "Draft questions for me",
                                    hint: "Write the questions for this meeting from their absences, what they said at their Return to Works and anything agreed at earlier meetings. They become boxes you fill in as you talk, and you can change or remove any of them. They are kept for this meeting, so opening it again costs nothing.",
                                    extraFields: {
                                      person_id: r.personId,
                                      ...(mf.bookingId ? { meeting_id: mf.bookingId } : {}),
                                    },
                                    questions: { dataKey: "ai_questions", answerKey: "meeting_questions" },
                                  }
                                : undefined
                            }
                            triggerLabel="Record meeting"
                            triggerClassName="btn-outline px-3 py-1.5 text-xs"
                            submitLabel="Save meeting"
                            bottomPanel={(ctx) => {
                              formOutcome.current[r.personId] = ctx.extras.outcome_body ?? "";
                              return (
                                <>
                                  {canDiscount ? (
                                    <DiscountInForm
                                      // Only the absences this stage covers (Phil, 2026-10-07).
                                      absences={mf.covered}
                                      ctx={ctx}
                                    />
                                  ) : null}
                                  <OutcomeInForm personId={r.personId} meetingId={mf.bookingId} ctx={ctx} />
                                </>
                              );
                            }}
                            presetAnswers={mf.presets}
                            freshPresets={["current_absence_level", "dates_of_absence_discussed"]}
                            hideFields={["name"]}
                            onSaved={(saved) => {
                              // Discounting is in the form now (Phil, 2026-10-07), so the save goes
                              // straight to the outcome letter.
                              const meetingId = saved.data?.meeting_id || null;
                              if (meetingId) {
                                const leaverDate = saved.data?.leaver_date || null;
                                setLetterFor({
                                  meetingId,
                                  personName: r.fullName,
                                  initialBody: formOutcome.current[r.personId] || null,
                                  leaverHref: leaverDate
                                    ? `/people/${r.personId}?leaver=${leaverDate}&from=${encodeURIComponent("/people/absence")}`
                                    : null,
                                });
                              }
                              delete formOutcome.current[r.personId];
                            }}
                          />
                        ) : null;
                      })()
                    ) : null}
                  {canManage && bookingByPerson[r.personId] ? (
                    <CancelRearrangeDialog
                      booking={bookingByPerson[r.personId]}
                      personName={r.fullName}
                      conductors={conductors}
                      offices={offices}
                    />
                  ) : null}
                  </div>
              </div>
            );
  };

  return (
    <div className="mt-1 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Absence</h1>
          <p className="page-subtitle">
            People with absences in the current window. Tracking method:{" "}
            {method === "bradford" ? "Bradford Factor" : "Trigger points (stages)"}.
          </p>
        </div>
        {branches.length > 1 && (
          <div>
            <label htmlFor="absence-branch" className="form-label">
              {bw.one}
            </label>
            <select
              id="absence-branch"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setPickPerson("");
              }}
            >
              <option value="">{bw.all}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Return to Work. Raised automatically when an absence ends, because a Return
          to Work happens after EVERY absence at every stage, so it must not depend on
          anyone remembering. Overdue ones sort to the top and read red. */}
      {canManage && rtwSchema && visibleRtw.length > 0 ? (
        <div className="glass-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Return to Work</h2>
            <span className="text-xs text-white/50">
              {visibleRtw.filter((r) => r.overdue).length} overdue of {visibleRtw.length}
            </span>
          </div>
          <div className="space-y-2">
            {visibleRtw.map((r) => (
              <div
                key={r.absenceEventId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{r.personName}</p>
                  <p className="text-xs text-white/50">
                    Off {fmtDay(r.startDate)}
                    {r.endDate ? ` to ${fmtDay(r.endDate)}` : ""}
                    {r.days !== null ? ` · ${r.days} day${r.days === 1 ? "" : "s"}` : ""}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const pill = rtwQuestionsPill(r.questions, Date.now());
                    return pill ? <span className={pill.className}>{pill.label}</span> : null;
                  })()}
                  <span className={r.overdue ? "pill-red" : "pill-amber"}>
                    {r.overdue ? "Overdue" : "Due"} {fmtDay(r.dueDate)}
                  </span>
                  {(() => {
                    const saved = rtwQuestionnaires[r.absenceEventId];
                    const first = r.personName.trim().split(/\s+/)[0] ?? "";
                    return (
                  <FormEvidenceDialog
                    title={`Return to Work for ${r.personName}`}
                    schema={rtwSchema}
                    action={recordReturnToWork}
                    extraFields={{ absence_event_id: r.absenceEventId }}
                    triggerLabel="Record"
                    triggerClassName="btn-outline px-3 py-1.5 text-xs"
                    openOnMount={openRtwId === r.absenceEventId}
                    submitLabel="Save the interview"
                    presetAnswers={{
                      absence_dates: `${fmtDay(r.startDate)}${r.endDate ? ` to ${fmtDay(r.endDate)}` : ""}`,
                      days_lost: r.days !== null ? String(r.days) : "",
                      reason_given: r.reason ?? "",
                      // Almost every Return to Work is recorded on the day it happens,
                      // so fill it in. Still editable.
                      interview_date: londonToday,
                      // MUST be preset. isFieldVisible returns false when the
                      // controlling answer is undefined, so an untouched checkbox would
                      // hide BOTH signature fields until someone clicked it. false makes
                      // the employee signature the visible default, which is the norm.
                      completed_over_phone: false,
                      // Phil: "a drop down filled with the person logged in but
                      // changeable". Usually you are the one holding the interview.
                      conducted_by: conductedByDefault,
                      ...(saved?.summary ? { absence_summary: saved.summary } : {}),
                    }}
                    initialAi={
                      saved && saved.questions.length > 0
                        ? { questions: saved.questions, answers: saved.answers, details: saved.details }
                        : undefined
                    }
                    /* Phil, 2026-09-25: whoever drafted them checks them before they go. Only
                       while nothing has been sent, because after that the employee may already
                       be reading the saved set. */
                    questionsEditable={!saved || saved.status === "drafted"}
                    questionsNote={
                      saved?.status === "answered" || saved?.hasFitNote ? (
                        <div className="space-y-2">
                          {saved.status === "answered" ? (
                            <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-white/80">
                              {first || "They"} answered these through their portal
                              {saved.answeredAt
                                ? ` on ${fmtDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(saved.answeredAt)))}`
                                : ""}. If
                              you are not happy with an answer, ring them and change it here before you
                              save.
                            </p>
                          ) : null}
                          {/* Their fit note, uploaded with their answers (0344). Filed into this
                              Return to Work's Evidence when it is saved. */}
                          {saved.hasFitNote ? (
                            <p className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                              <span>
                                Fit note uploaded{saved.fitNoteName ? `: ${saved.fitNoteName}` : ""}. It is
                                filed with this Return to Work when you save it.
                              </span>
                              <a
                                href={`/api/absence/rtw-fit-note/${saved.id}`}
                                target="_blank"
                                rel="noopener"
                                className="btn-outline px-2.5 py-1 text-xs"
                              >
                                View fit note
                              </a>
                            </p>
                          ) : null}
                        </div>
                      ) : null
                    }
                    questionsFooter={({ questions, lock }) => (
                      <RtwSendPanel
                        absenceEventId={r.absenceEventId}
                        firstName={first}
                        status={saved?.status ?? "drafted"}
                        sentAt={saved?.sentAt ?? null}
                        sentToLast4={saved?.sentToLast4 ?? null}
                        expiresAt={saved?.expiresAt ?? null}
                        questions={questions}
                        lock={lock}
                      />
                    )}
                    questionsExtraFields={["employee_comments"]}
                    aiDraft={{
                      action: draftReturnToWork,
                      label: "Draft it for me",
                      hint: "Write the summary, and the whole set of questions for this particular absence, from the record. They cover fitness to return and anything at work that played a part, in words written for this absence. The questions become boxes you fill in as you talk. You can change every word before saving, and nothing is stored until you do.",
                      extraFields: { absence_event_id: r.absenceEventId },
                      // Phil: not every absence is the same, so the questions are
                      // written per absence by the AI rather than fixed in the schema.
                      // v4 (0148) does the same for the conversation questions that were
                      // still fixed in v3. They land in the tailored_questions long_text
                      // as readable text, which keeps Evidence valid against the stored
                      // version.
                      questions: { dataKey: "ai_questions", answerKey: "tailored_questions" },
                    }}
                  />
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Record a new absence (person picker, then the form). */}
      {canManage && (
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="absence-person" className="form-label">
              Record an absence for
            </label>
            {/* THE INCIDENT FORM'S NAME PICKER (Phil, 2026-10-07): type a few letters and pick from
                the list, the same searchable list the Incident Report uses, rather than a long
                drop down. Typing after a pick clears it, so the absence can never be saved
                against a name that is no longer the one shown. */}
            <RecordTypeahead
              id="absence-person"
              query={pickQuery}
              choices={personChoices}
              placeholder="Start typing a name"
              noMatchText="Nobody on the register matches that."
              onQueryChange={(next) => {
                setPickQuery(next);
                setPickPerson("");
              }}
              onChoose={(choice) => {
                setPickQuery(choice.label);
                setPickPerson(choice.id);
              }}
            />
          </div>
          {absenceSchema && pickPerson ? (
            <FormEvidenceDialog
              title="Record an absence"
              schema={absenceSchema}
              action={recordAbsence}
              extraFields={{ person_id: pickPerson }}
              triggerLabel="Record absence"
              submitLabel="Save absence"
              hideFields={["name", "email"]}
            />
          ) : (
            <button
              type="button"
              className="btn-primary px-3 py-2 text-sm disabled:opacity-100"
              disabled
            >
              Record absence
            </button>
          )}
          {!absenceSchema && (
            <p className="w-full text-xs text-amber-300">
              The Absence Back Office form is not in this company yet, so absences
              cannot be recorded until it is imported.
            </p>
          )}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          No absences recorded{branch ? ` for this ${bw.oneLower}` : ""}. People appear here
          once an absence is logged against them.
        </div>
      ) : (
        <>
          {/* Two folded sections (Phil, 2026-10-06). Action required: a meeting is due and not
              booked, or booked and not yet recorded; they stay here until the meeting is
              recorded. Tracking: everyone else with absences, at a stage already dealt with or
              below threshold. Same ranking inside each (lib/absence/rank.ts). */}
          <AbsenceSection
            title="Action required"
            rows={actionRows}
            empty="Nobody needs a meeting booked or recorded."
            renderCard={renderCard}
          />
          <AbsenceSection
            title="Tracking"
            rows={trackingRows}
            empty="Nobody else has absences in the window."
            renderCard={renderCard}
          />
        </>
      )}

      {letterFor ? (
        <OutcomeLetterDialog
          key={letterFor.meetingId}
          meetingId={letterFor.meetingId}
          personName={letterFor.personName}
          initialBody={letterFor.initialBody}
          leaverHref={letterFor.leaverHref}
          onClose={closeLetter}
        />
      ) : null}
    </div>
  );
}

/** A folded section of absence tiles: closed by default, the count in its heading, the same
 *  summary row and chevron as the Holiday page's folded lists. */
function AbsenceSection({
  title,
  rows,
  empty,
  renderCard,
}: {
  title: string;
  rows: AbsencePersonRow[];
  empty: string;
  renderCard: (r: AbsencePersonRow) => React.ReactNode;
}) {
  return (
    <details className="fold glass-card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.04]">
        <span className="text-sm font-semibold text-white/80">
          {title} ({rows.length})
        </span>
        <span aria-hidden className="fold-chevron shrink-0 text-lg text-white/40 transition-transform">
          ›
        </span>
      </summary>
      <div className="border-t border-white/10 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-white/50">{empty}</p>
        ) : (
          /* FOUR ACROSS on a wide desktop (Phil, 2026-09-24: "each tile needs to be narrower",
             then "lets try 4 tiles per line"). Three on a smaller desktop, two on a laptop or
             tablet, one on a phone. */
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map(renderCard)}
          </div>
        )}
      </div>
    </details>
  );
}
