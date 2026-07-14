import "server-only";

/**
 * Be Care Compliant — Training sub-department data.
 * A company catalogue of courses + a per-person record per course. RAG is driven
 * by each recurring course's expiry date (one-off courses are simply done or not).
 * Everything is computed server side and handed to the client as plain, formatted
 * cells, so the matrix component stays dumb. Active people only (no leavers,
 * archived). Admin / branch manager only (enforced again by RLS). No dashes in copy.
 */

import { createClient } from "@/lib/supabase/server";

export type TrainingCourse = {
  id: string;
  name: string;
  renewal_months: number | null; // null = one off
  mandatory: boolean;
  is_safeguarding: boolean;
  amber_days: number;
  sort_order: number;
};

export type Rag = "green" | "amber" | "red" | "none";

export type TrainingCell = {
  rag: Rag;
  label: string; // main line, e.g. "12/06/2027", "Done", "Not done"
  sub?: string; // small tag, e.g. "Expired", "Due soon"
  completedOn?: string | null; // ISO, for the edit panel
  expiryOn?: string | null; // ISO, for the edit panel
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

function addDaysIso(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

type CourseRow = TrainingCourse;
type RecordRow = {
  person_id: string;
  course_id: string;
  status: string;
  completed_on: string | null;
  expiry_on: string | null;
};
type PersonRow = {
  id: string;
  full_name: string;
  branch_id: string | null;
  branches: { name: string } | null;
};

/** Compute one cell's RAG from the course + the person's record (if any). */
function cellFor(
  course: TrainingCourse,
  rec: RecordRow | undefined,
  todayIso: string,
): TrainingCell {
  // One off course: done (green) or not done (red).
  if (course.renewal_months == null) {
    if (rec && rec.status === "completed") {
      return { rag: "green", label: "Done", completedOn: rec.completed_on, expiryOn: null };
    }
    return { rag: "red", label: "Not done" };
  }

  // Recurring course: no record means it has never been done.
  if (!rec || rec.status !== "completed") {
    return { rag: "red", label: "Not done" };
  }
  // Completed but no expiry recorded: treat as valid but flag it needs a date.
  if (!rec.expiry_on) {
    return { rag: "amber", label: "Done", sub: "No renewal date", completedOn: rec.completed_on, expiryOn: null };
  }

  const amberIso = addDaysIso(todayIso, course.amber_days);
  const disp = fmtDMY(rec.expiry_on);
  if (rec.expiry_on < todayIso) {
    return { rag: "red", label: disp, sub: "Expired", completedOn: rec.completed_on, expiryOn: rec.expiry_on };
  }
  if (rec.expiry_on <= amberIso) {
    return { rag: "amber", label: disp, sub: "Due soon", completedOn: rec.completed_on, expiryOn: rec.expiry_on };
  }
  return { rag: "green", label: disp, completedOn: rec.completed_on, expiryOn: rec.expiry_on };
}

export async function getTrainingMatrix(
  companyId: string,
  branchId: string | null,
): Promise<TrainingMatrix> {
  const supabase = await createClient();
  const todayIso = todayLondonIso();

  const coursesQ = supabase
    .from("training_courses")
    .select("id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  let peopleQ = supabase
    .from("people")
    .select("id, full_name, branch_id, branches(name)")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .neq("employment_status", "leaver")
    .order("full_name", { ascending: true });
  if (branchId) peopleQ = peopleQ.eq("branch_id", branchId);

  const [{ data: coursesRaw }, { data: peopleRaw }] = await Promise.all([coursesQ, peopleQ]);
  const courses = (coursesRaw as CourseRow[] | null) ?? [];
  const peopleRows = (peopleRaw as unknown as PersonRow[] | null) ?? [];
  const personIds = peopleRows.map((p) => p.id);

  const byPerson = new Map<string, Map<string, RecordRow>>();
  if (personIds.length > 0) {
    const { data: recRaw } = await supabase
      .from("person_training")
      .select("person_id, course_id, status, completed_on, expiry_on")
      .eq("company_id", companyId)
      .in("person_id", personIds);
    for (const r of (recRaw as RecordRow[] | null) ?? []) {
      const m = byPerson.get(r.person_id) ?? new Map<string, RecordRow>();
      m.set(r.course_id, r);
      byPerson.set(r.person_id, m);
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

  const pct = (ok: number, total: number) =>
    total === 0 ? null : Math.round((ok / total) * 1000) / 10;

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
}
