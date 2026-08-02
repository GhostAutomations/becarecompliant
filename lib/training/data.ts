import "server-only";

/**
 * Be Care Compliant — Training sub-department data.
 * A company catalogue of courses + a per-person record per course. RAG is driven
 * by each recurring course's expiry date (one-off courses are simply done or not).
 * Everything is computed server side and handed to the client as plain, formatted
 * cells, so the matrix component stays dumb. Active people only (no leavers,
 * archived). Admin / branch manager only (enforced again by RLS). No dashes in copy.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { trainingStatus, type TrainingStatus } from "@/lib/training/renewal";

export type TrainingCourse = {
  id: string;
  name: string;
  renewal_months: number | null; // null = one off
  mandatory: boolean;
  is_safeguarding: boolean;
  amber_days: number;
  sort_order: number;
  active: boolean;
};

export type Rag = "green" | "amber" | "red" | "none";

export type TrainingCell = {
  rag: Rag;
  label: string; // main line, e.g. "12/06/2027", "Done", "Not done"
  sub?: string; // small tag, e.g. "Expired", "Due soon"
  /** The state this cell is in, from lib/training/renewal.ts. The SAME function the digest
   *  chases on, so a carer cannot be amber on screen and absent from the email about it. */
  status: TrainingStatus;
  /** Completed, but with no renewal date on the record. In date, so `status` is valid and the
   *  digest leaves it alone, yet amber on the matrix because somebody has to finish the job.
   *  A FLAG rather than a match on the "No renewal date" caption: the filter used to compare the
   *  displayed string, so rewording the caption would have silently emptied it. */
  needsRenewalDate?: boolean;
  completedOn?: string | null; // ISO, for the edit panel
  expiryOn?: string | null; // ISO, for the edit panel
  recordId?: string | null; // person_training id, when a record exists
  hasCertificate?: boolean;
};

export type TrainingPerson = {
  id: string;
  full_name: string;
  branch_id: string | null;
  branch_name: string;
  cells: Record<string, TrainingCell>; // keyed by course id
};

export type TrainingSummary = {
  people: number;
  mandatoryCompliancePct: number | null; // green or amber over all mandatory cells
  safeguardingPct: number | null;
  green: number;
  amber: number;
  red: number;
};

export type TrainingMatrix = {
  courses: TrainingCourse[];
  people: TrainingPerson[];
  summary: TrainingSummary;
};

function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayLondonIso(): string {
  // en-CA gives YYYY-MM-DD; Europe/London keeps civil-date correctness.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type CourseRow = TrainingCourse;
type RecordRow = {
  id: string;
  person_id: string;
  course_id: string;
  status: string;
  completed_on: string | null;
  expiry_on: string | null;
  certificate_path: string | null;
};
type PersonRow = {
  id: string;
  full_name: string;
  branch_id: string | null;
  branches: { name: string } | null;
};

/** Compute one cell's RAG from the course + the person's record (if any). */
/**
 * Read every row, a page at a time, and throw rather than return a short list.
 *
 * PostgREST caps a response at 1000 rows and says nothing about it. A training matrix missing its
 * tail reports people as untrained who are not, so a partial read must fail loudly.
 */
async function readAllRows<T>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
  label: string,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) {
      throw new Error(
        `Training could not read ${label}: ${(error as { message?: string }).message ?? "unknown error"}`,
      );
    }
    const rows = ((data as T[] | null) ?? []);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function cellFor(
  course: TrainingCourse,
  rec: RecordRow | undefined,
  todayIso: string,
): TrainingCell {
  const meta = {
    completedOn: rec?.completed_on ?? null,
    expiryOn: rec?.expiry_on ?? null,
    recordId: rec?.id ?? null,
    hasCertificate: !!rec?.certificate_path,
  };
  const done = rec && rec.status === "completed";
  const oneOff = course.renewal_months == null;

  /*
   * ONE RULE, in lib/training/renewal.ts, shared with the daily digest.
   *
   * The colours below are derived from it rather than worked out again here. Until 2026-08-01
   * the matrix decided amber and expired with its own date comparisons, which was survivable
   * only because nothing else in the app ever looked at training.
   */
  const status = trainingStatus({
    // The RECORD is what makes it done, not the dates on it. A one off course imported from a
    // spreadsheet is marked completed with no dates whatsoever.
    recorded: Boolean(done),
    expiryOn: done ? rec!.expiry_on : null,
    amberDays: course.amber_days,
    oneOff,
    todayIso,
  });

  if (status === "missing") return { rag: "red", label: "Not done", status, ...meta };
  // A one off course, once done, is done.
  if (oneOff) return { rag: "green", label: "Done", status, ...meta };
  // Completed but no renewal date recorded: in date, but somebody has to finish the job.
  if (!rec!.expiry_on)
    return { rag: "amber", label: "Done", sub: "No renewal date", status, needsRenewalDate: true, ...meta };

  const disp = fmtDMY(rec!.expiry_on);
  if (status === "expired") return { rag: "red", label: disp, sub: "Expired", status, ...meta };
  if (status === "due_soon") return { rag: "amber", label: disp, sub: "Due soon", status, ...meta };
  return { rag: "green", label: disp, status, ...meta };
}

/** All courses for the company (active and inactive), for the config screen. */
export async function listAllCourses(companyId: string): Promise<TrainingCourse[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_courses")
    .select("id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order, active")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });
  return (data as TrainingCourse[] | null) ?? [];
}

/**
 * Wrapped in React cache(): a dashboard load now asks for this three times over (the training
 * tile, the compliance score and the PQS engine), and it reads every person and every training
 * record each time. Primitive arguments, so the cache actually hits.
 */
export const getTrainingMatrix = cache(async function getTrainingMatrix(
  companyId: string,
  branchId: string | null,
  /**
   * The date to judge "in date" AT. Defaults to today, which is what every screen wants.
   *
   * The PQS report passes the END of its reporting period, because a report that says "1 Jan to
   * 30 Jun" and then prints today's training position is telling you two different things under
   * one heading (2026-07-30).
   */
  asOfIso?: string,
): Promise<TrainingMatrix> {
  const supabase = await createClient();
  const todayIso = asOfIso ?? todayLondonIso();

  const coursesQ = supabase
    .from("training_courses")
    .select("id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order, active")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  // Ordered by id as well as name: LIMIT/OFFSET paging needs a TOTAL order, and two people can
  // share a name.
  let peopleQ = supabase
    .from("people")
    .select("id, full_name, branch_id, branches(name)")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .neq("employment_status", "leaver")
    .order("full_name", { ascending: true })
    .order("id", { ascending: true });
  if (branchId) peopleQ = peopleQ.eq("branch_id", branchId);

  const [{ data: coursesRaw }, peopleRows] = await Promise.all([
    coursesQ,
    readAllRows<PersonRow>(peopleQ, "the People register"),
  ]);
  const courses = (coursesRaw as CourseRow[] | null) ?? [];
  const personIds = peopleRows.map((p) => p.id);

  const byPerson = new Map<string, Map<string, RecordRow>>();
  if (personIds.length > 0) {
    /*
     * PAGED and CHUNKED. Training records are people TIMES courses, so 100 staff on 12 courses is
     * already 1200 rows and PostgREST caps a response at 1000. Anything past the cut had no
     * record, and no record renders as "not done", so mandatory training and safeguarding, two
     * scored PQS measures, came out understated. This bites at a far smaller company than the
     * people cap does.
     */
    const IDS_PER_REQUEST = 200;
    for (let i = 0; i < personIds.length; i += IDS_PER_REQUEST) {
      const chunk = personIds.slice(i, i + IDS_PER_REQUEST);
      const recQ = supabase
        .from("person_training")
        .select("id, person_id, course_id, status, completed_on, expiry_on, certificate_path")
        .eq("company_id", companyId)
        .in("person_id", chunk)
        .order("id", { ascending: true });
      for (const r of await readAllRows<RecordRow>(recQ, "training records")) {
        // A record completed AFTER the date being judged did not exist then. Ignoring the date
        // would let training done last week count towards a period that closed in June.
        if (asOfIso && r.completed_on && r.completed_on > asOfIso) continue;
        const m = byPerson.get(r.person_id) ?? new Map<string, RecordRow>();
        m.set(r.course_id, r);
        byPerson.set(r.person_id, m);
      }
    }
  }

  let green = 0;
  let amber = 0;
  let red = 0;
  let mandTotal = 0;
  let mandOk = 0;
  let safeTotal = 0;
  let safeOk = 0;

  const people: TrainingPerson[] = peopleRows.map((p) => {
    const recs = byPerson.get(p.id);
    const cells: Record<string, TrainingCell> = {};
    for (const c of courses) {
      const cell = cellFor(c, recs?.get(c.id), todayIso);
      cells[c.id] = cell;
      if (cell.rag === "green") green += 1;
      else if (cell.rag === "amber") amber += 1;
      else if (cell.rag === "red") red += 1;
      const compliant = cell.rag === "green" || cell.rag === "amber";
      if (c.mandatory) {
        mandTotal += 1;
        if (compliant) mandOk += 1;
      }
      if (c.is_safeguarding) {
        safeTotal += 1;
        if (compliant) safeOk += 1;
      }
    }
    return {
      id: p.id,
      full_name: p.full_name,
      branch_id: p.branch_id,
      branch_name: p.branches?.name ?? "",
      cells,
    };
  });

  // ROUNDED DOWN, never up (Phil, 2026-07-30). 84.96% is not 85%, and 85 is a PQS band boundary.
  const pct = (ok: number, total: number) =>
    total === 0 ? null : Math.floor((ok / total) * 1000) / 10;

  return {
    courses,
    people,
    summary: {
      people: people.length,
      mandatoryCompliancePct: pct(mandOk, mandTotal),
      safeguardingPct: pct(safeOk, safeTotal),
      green,
      amber,
      red,
    },
  };
});
