import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { NoFormLinked } from "@/components/forms/no-form-linked";
import { choicesForSchema } from "@/lib/forms/lookup-data";
import SupportModeNotice from "@/components/support-mode-notice";
import CompleteCheck from "@/components/people/complete-check";
import PaperOrForm, { type PaperUploadProps } from "@/components/evidence/paper-upload";
import { paperOffered } from "@/lib/evidence/paper";
import { readDraft } from "@/lib/forms/draft-store";
import { checkDraftKey } from "@/lib/forms/draft-key";
import {
  getPerson,
  getPublishedFormVersion,
  getPersonChecks,
  getPersonTracker,
  getSupervisionCompDates,
  getAppraisalCompDates,
  getSupervisionCycleMode,
  branchName,
} from "@/lib/people/data";
import { supervisionSlots, annotateSupervisionOptions } from "@/lib/people/logic";
import { nextSupervisionNumber } from "@/lib/people/next-supervision";
import { DEFAULT_AMBER_DAYS, todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { recordFormPresets } from "@/lib/forms/record-presets";
import { fieldToNameSelect, findField, isFormSchema, removeField, type Answers, type FormSchema } from "@/lib/form-schema";
import type { CheckDefinition } from "@/lib/people/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seniorReaderFor } from "@/lib/senior/access";

export const metadata: Metadata = { title: "Complete check" };

/* A Senior is on the list too (0339), but only for the Checks ticked on their tile: the
   database answers that per Check (senior_may_do_instance), below. */
const COMPLETE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter", "platform_admin", "senior"];

export default async function CompleteCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; instanceId: string }>;
  searchParams: Promise<{ sup?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, instanceId } = await params;
  const { sup } = await searchParams;
  if (!COMPLETE_ROLES.includes(profile.role)) redirect(`/people/${id}`);
  // Reachable only by typing the URL now that the buttons are hidden, but it is the
  // authoritative half: the save would be refused, so never render the form.
  if (profile.actingAsCompanyId) {
    return (
      <SupportModeNotice
        backHref={`/people/${id}`}
        backLabel="Back to the record"
        what="complete a check"
      />
    );
  }

  /* A SENIOR: asked of the database before anything is read. A Check they may not do sends
     them back to their list; one they may do hands the page a reader for the record's name,
     branch and supervision history, which their own client cannot read (lib/senior/access.ts). */
  const isSenior = profile.role === "senior";
  let reader: SupabaseClient | undefined;
  if (isSenior) {
    const r = await seniorReaderFor(instanceId);
    if (!r) redirect("/people");
    reader = r;
  }

  const supabase = await createClient();
  const { data: instance } = await supabase
    .from("check_instances")
    .select("id, person_id, definition:check_definitions(*)")
    .eq("id", instanceId)
    .maybeSingle();

  const def = (instance?.definition as CheckDefinition | undefined) ?? undefined;
  if (!instance || instance.person_id !== id || !def) redirect(`/people/${id}`);
  /* NO FORM, SAID RATHER THAN BOUNCED (DEF-108, 2 Oct 2026). A Planner booking for a check with
     no form linked used to send the person straight back to the record with no reason given. */
  if (!def.form_id) {
    return (
      <div className="page-form space-y-4">
        <BackLink href={`/people/${id}`} label="Back to the record" />
        <h1 className="page-title">Complete {def.name}</h1>
        <NoFormLinked checkName={def.name} />
      </div>
    );
  }

  const person = await getPerson(id, reader);
  const version = await getPublishedFormVersion(def.form_id);
  if (!version || !isFormSchema(version.schema)) {
    return (
      <div className="page-form">
        <h1 className="page-title">Complete {def.name}</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          This check has no usable form version. Please contact your administrator.
        </div>
      </div>
    );
  }

  /* Supervision: which supervision it is is NEVER asked. The Complete button on the
     record passes it as ?sup=, and anything arriving without that -- a task opened from
     the planner, a bookmark, a link in an email -- works it out from the record instead
     (Phil, 2026-09-08: "why does it not know? it should [be] the same as if i am clicking
     the supervision from the name card"). Supervisions are sequential, so the answer is
     the first slot with no completion against it, which is the same rule the record card
     uses to decide which tile gets a Complete button: nextSupervisionNumber, one rule in
     one place so the two can never disagree.

     The dropdown survives only for the case the rule cannot answer -- every supervision
     in the cycle already completed -- where asking is the honest thing to do. */
  let schema = version.schema as FormSchema;
  let presetAnswers: Answers | undefined;
  let heading = def.name;
  // The choices a paper upload offers when the record cannot say which supervision it is.
  let supOptions = ["1", "2", "3"];
  if (def.key === "supervision") {
    if (sup === "1" || sup === "2" || sup === "3" || sup === "4") {
      schema = removeField(schema, "supervision_type");
      presetAnswers = { supervision_type: sup };
      heading = `Supervision ${sup}`;
    } else {
      const appraisalDef = (await getPersonChecks(id, reader)).find((s) => s.check_key === "appraisal") ?? null;
      const cycleMode = await getSupervisionCycleMode(def.company_id as string, reader);
      const [supCompDates, appraisalCompDates, tracker] = await Promise.all([
        getSupervisionCompDates(id, def.form_id, def.id, reader),
        getAppraisalCompDates(id, appraisalDef?.form_id ?? null, appraisalDef?.definition_id ?? null, reader),
        getPersonTracker(id, reader),
      ]);
      const slots = supervisionSlots(
        def.interval,
        supCompDates,
        def.amber_days ?? DEFAULT_AMBER_DAYS,
        appraisalCompDates,
        tracker?.probation_end_actual ?? null,
        undefined,
        cycleMode === "four_supervisions" ? 4 : 3,
        cycleMode,
      );
      if (cycleMode === "four_supervisions") supOptions = ["1", "2", "3", "4"];
      const nextN = nextSupervisionNumber(slots);
      if (nextN !== null) {
        schema = removeField(schema, "supervision_type");
        presetAnswers = { supervision_type: String(nextN) };
        heading = `Supervision ${nextN}`;
      } else {
        schema = annotateSupervisionOptions(schema, slots);
      }
    }
  }

  // Pre-fill the person's own details (name + branch) into whatever form this check
  // uses, so it never re-asks who the check is for. Presets only (no schema change),
  // so client and server validate the same form. Works for any form, new or old.
  // READ THE NAME FROM THE RECORD, not from the branch picker. listBranches now returns only
  // the branches this viewer may CHOOSE, and a conductor booked onto a carer in another branch
  // (0183) still has to see whose branch it is. Names are readable to the whole company.
  const personBranchName = await branchName(person?.branch_id);
  const recordPresets = recordFormPresets(schema, {
    fullName: person?.full_name ?? null,
    branchName: personBranchName,
    authorName: profile.full_name || profile.email || null,
    today: formatCivilDate(todayInLondon()),
  });
  presetAnswers = { ...recordPresets, ...(presetAnswers ?? {}) };

  // Audit (and any form with an auditor_name field): the Auditor Full Name is a
  // dropdown of the company's active users, preselected to whoever is signed in
  // and changeable to any other user (Phil, 2026-07-25).
  if (findField(schema, "auditor_name")) {
    const { data: userRows } = await supabase.rpc("get_company_user_names");
    const names = ((userRows ?? []) as { display_name: string }[]).map((u) => u.display_name);
    schema = fieldToNameSelect(schema, "auditor_name", names, profile.full_name || profile.email || null);
  }

  /* Only queried when the schema actually has a record_lookup field, and read through
     the caller's own client so the names offered are the ones RLS lets them see. */
  const lookupChoices = profile.company_id
    ? await choicesForSchema(profile.company_id, schema, { senior: isSenior })
    : undefined;

  /* What this user had already typed into this check, if they were interrupted in the
     last twelve hours. Read here, on the server, so the form opens filled in with
     nothing to wait for. */
  const draft = await readDraft(checkDraftKey("people", instanceId));

  /* DONE ON PAPER (DEF-056): the other way of completing this Check, Admins only. The
     database refuses everybody else too (submit_paper_evidence). */
  const paper: PaperUploadProps | null = paperOffered({
    role: profile.role,
    supportMode: !!profile.actingAsCompanyId,
    population: "people",
    checkKey: def.key,
    anchor: def.anchor ?? null,
  })
    ? {
        instanceId,
        todayIso: formatCivilDate(todayInLondon()),
        supervision:
          def.key === "supervision"
            ? { preset: typeof presetAnswers?.supervision_type === "string" ? presetAnswers.supervision_type : null, options: supOptions }
            : null,
        healthCheck: def.key === "health_check",
      }
    : null;
  return (
    <div className="page-form space-y-6">
      <div>
        {isSenior ? (
          <BackLink href="/people" label="Back to People" />
        ) : (
          <BackLink href={`/people/${id}`} label={`Back to ${person?.full_name ?? "record"}`} />
        )}
        <h1 className="page-title mt-1">{heading}</h1>
        <p className="page-subtitle">
          Completing this form stores it as inspection evidence and schedules the
          next due date automatically.
        </p>
      </div>

      <PaperOrForm paper={paper}>
        <div className="glass-card p-6">
          <CompleteCheck
            schema={schema}
            instanceId={instanceId}
            presetAnswers={presetAnswers}
            lookupChoices={lookupChoices}
            draft={draft}
          />
        </div>
      </PaperOrForm>
    </div>
  );
}
