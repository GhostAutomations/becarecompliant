import "server-only";

/**
 * Be Care Compliant — on time completion rate report (Cardiff Council PQS).
 *
 * The PQS asks: of all three monthly reviews / supervisions that fell DUE in the
 * last six months, what percentage were completed by their due date? The due date
 * is "the last completion plus the interval" (e.g. last supervision 1 April, due
 * 1 July). This module reconstructs each check's cycles from the completion
 * history (Evidence timestamps) plus the check's recurrence interval, then counts
 * cycles whose due date fell in the period and whether each was met on time.
 *
 * Method, per cycle (auditable, matches the PQS wording):
 *   anchors = [record start date, ...completion dates], SORTED ascending
 *   for each gap between anchor a_k and the next completion a_(k+1), the check falls due at
 *   a_k + interval and KEEPS falling due every interval until it is done. Every one of those
 *   due dates counts. Only the last of them is the cycle the completion discharges, so it is
 *   on time when a_(k+1) is on or before it; the ones before it were never done at all. An
 *   open gap counts every due date already past; the cycle currently running is excluded
 *   because it is not late yet. The walk is pure and unit tested in on-time-cycles.ts.
 *
 * Reads through the caller's RLS client (branch scoped for managers). Active
 * records only. No dashes in copy.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { dueDatesInGap, cycleOnTime, buildAnchors, floorPct } from "./on-time-cycles";
import {
  type CivilDate,
  type Frequency,
  addInterval,
  addMonths,
  parseCivilDate,
  formatCivilDate,
  compareCivil,
  civilDateInLondon,
  todayInLondon,
} from "@/lib/recurrence";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import type { ReportDoc, ReportCell } from "@/lib/export/pdf";
import { fmtDate, generatedAt } from "@/lib/export/format";
import { getTrainingMatrix } from "@/lib/training/data";
import { getSatisfaction } from "@/lib/service-users/satisfaction";
import { getOutcomesRegister } from "@/lib/service-users/data";

export type OnTimeWindow = { from: string; to: string };

export type OnTimeStat = {
  /** The check definition's id. THE identity: `key` is unique per (company, population) only, so
   *  a people Audit and a service user Audit share a key and would overwrite each other. */
  checkId: string;
  checkKey: string;
  checkName: string;
  population: "people" | "service_users";
  gradedAt: string; // the deadline each cycle was graded against (regulatory or operational)
  dueInPeriod: number;
  onTime: number;
  ratePct: number | null; // 0..100, null when nothing fell due
  band: number | null; // PQS score 0/2/5/7/10
};

export type OnTimeCycle = {
  /** The definition's KEY. The breakdown filters on this, not on the name: two definitions can
   *  share a name across the two registers. */
  checkKey: string;
  checkName: string;
  recordName: string;
  branchName: string;
  dueDate: string; // ISO
  completedOn: string | null; // ISO of the completion that met it, or null if overdue
  onTime: boolean;
};

/** Default PQS period: the last 6 full months up to today. */
export function defaultOnTimeWindow(now: Date = new Date()): OnTimeWindow {
  const today = todayInLondon(now);
  return { from: formatCivilDate(addMonths(today, -6)), to: formatCivilDate(today) };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export function resolveOnTimeWindow(from: string | null, to: string | null): OnTimeWindow {
  const def = defaultOnTimeWindow();
  return {
    from: from && ISO_RE.test(from) ? from : def.from,
    to: to && ISO_RE.test(to) ? to : def.to,
  };
}

/** PQS score band from a percentage. 100 = 10, 85 to 99.9 = 7, 70 to 84.9 = 5,
 *  50 to 69.9 = 2, under 50 = 0. */
function pqsBand(onTime: number, total: number): number | null {
  // Banded from the rate that is PRINTED, not from the raw fraction. Two rules over one number
  // meant 84.96% could print as 85% and score a 5 on one row and a 7 on another.
  return bandPct(floorPct(onTime, total));
}

/** PQS band straight from a percentage (for training and SCW rates). */
function bandPct(pct: number | null): number | null {
  if (pct == null) return null;
  if (pct >= 100) return 10;
  if (pct >= 85) return 7;
  if (pct >= 70) return 5;
  if (pct >= 50) return 2;
  return 0;
}

export type PqsMeasure = {
  name: string;
  register: "People" | "Service Users";
  gradedAt: string;
  rate: number | null;
  band: number | null;
  star: string;
};

type DefRow = {
  id: string;
  key: string;
  name: string;
  population: "people" | "service_users";
  form_id: string;
  frequency: Frequency;
  interval: number;
  reporting_interval_days: number | null;
};

/** London civil date of an evidence timestamp. */
function tsToCivil(ts: string): CivilDate {
  return civilDateInLondon(new Date(ts));
}

/** Supabase types a to-one embedded relation as an array in some shapes; normalise to one row. */
function relName(v: { name: string } | { name: string }[] | null): string | null {
  if (Array.isArray(v)) return v[0]?.name ?? null;
  return v?.name ?? null;
}

type PersonRawShape = {
  id: string;
  full_name: string;
  branch_id: string | null;
  start_date: string | null;
  scw_registration_number: string | null;
  branches: { name: string } | { name: string }[] | null;
};
type SuRawShape = {
  id: string;
  full_name: string;
  branch_id: string | null;
  package_start_date: string | null;
  branches: { name: string } | { name: string }[] | null;
};

/**
 * Read a whole table's worth of rows, a page at a time.
 *
 * PostgREST caps a response at 1000 rows and says nothing about it. On a compliance return that
 * is not a performance detail: it is people quietly missing from their own figures.
 */
async function readAll<T>(
  query: {
    range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
  },
  label: string,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    /*
     * A failed page is NOT the end of the data. Swallowing it would return a short register and
     * report it as a complete one, which is the silently-missing-people bug wearing a different
     * hat. On a compliance return, failing loudly beats a number that is quietly wrong.
     */
    if (error) throw new Error(`PQS report could not read ${label}: ${(error as { message?: string }).message ?? "unknown error"}`);
    const rows = ((data as T[] | null) ?? []);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type OnTimeInput = {
  companyId: string;
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  window: OnTimeWindow;
};

/**
 * The PQS engine, split out from the renderer (2026-07-29).
 *
 * WHY. The dashboard needs the PQS measures as numbers, and the report needs them as a
 * document. Before this split the only way to get them was to render the whole report, so the
 * dashboard showed two figures it could reach cheaply instead of the real set. That is the same
 * mistake as the Evidence page and the Evidence PDF: two surfaces, two code paths, and numbers
 * that drift. Now there is ONE computation and two presentations of it.
 */
async function computeOnTime(input: OnTimeInput) {
  const supabase = await createClient();
  const win = input.window;
  const today = todayInLondon();
  const fromC = parseCivilDate(win.from);
  const toC = parseCivilDate(win.to);

  // 1. Recurring, form backed check definitions (a supervision / review has a form
  //    and an interval; one off checks like Setup, interval <= 0, are excluded).
  const { data: defsRaw } = await supabase
    .from("check_definitions")
    .select("id, key, name, population, form_id, frequency, interval, reporting_interval_days")
    .eq("company_id", input.companyId)
    .eq("active", true)
    .eq("recurring", true)
    .not("form_id", "is", null)
    .gt("interval", 0)
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  const defs = (defsRaw as unknown as DefRow[] | null)?.filter((d) => d.form_id) ?? [];
  if (defs.length === 0) {
    // No recurring checks: nothing to score. Returns the same shape as the full path so the
    // renderer and the dashboard both get an empty set rather than a different type.
    return {
      win,
      stats: [] as OnTimeStat[],
      cycles: [] as OnTimeCycle[],
      pqsStars: {} as Record<string, string>,
      extraMeasures: [] as PqsMeasure[],
      empty: "No recurring checks are configured for this company.",
    };
  }

  // 2. Active records (branch scoped by RLS + the optional branch filter).
  // .order("id") is not cosmetic: LIMIT/OFFSET paging over an UNORDERED scan can hand back the
  // same row twice and miss another, so a carer would be double counted or absent.
  let peopleQ = supabase
    .from("people")
    .select("id, full_name, branch_id, start_date, scw_registration_number, branches(name)")
    .eq("company_id", input.companyId)
    .is("archived_at", null)
    .neq("employment_status", "leaver")
    .order("id", { ascending: true });
  let suQ = supabase
    .from("service_users")
    .select("id, full_name, branch_id, package_start_date, branches(name)")
    .eq("company_id", input.companyId)
    .is("archived_at", null)
    .neq("service_status", "cancelled")
    .order("id", { ascending: true });
  if (input.branchId) {
    peopleQ = peopleQ.eq("branch_id", input.branchId);
    suQ = suQ.eq("branch_id", input.branchId);
  }
  // Both registers are read in FULL. PostgREST caps a response at 1000 rows, and a company past
  // that would have had the rest of its people silently missing from its own compliance return.
  const [peopleRaw, suRaw] = await Promise.all([
    readAll<PersonRawShape>(peopleQ, "the People register"),
    readAll<SuRawShape>(suQ, "the Service User register"),
  ]);

  type Rec = { id: string; name: string; branch: string; start: string | null; population: "people" | "service_users" };
  const staff = peopleRaw;
  const records: Rec[] = [
    ...staff.map((p) => ({
      id: p.id,
      name: p.full_name,
      branch: relName(p.branches) ?? input.branchName ?? "",
      start: p.start_date,
      population: "people" as const,
    })),
    ...suRaw.map((s) => ({
      id: s.id,
      name: s.full_name,
      branch: relName(s.branches) ?? input.branchName ?? "",
      start: s.package_start_date,
      population: "service_users" as const,
    })),
  ];
  const recordById = new Map(records.map((r) => [r.id, r]));

  // 3. Completion history: evidence for these forms + records.
  const formIds = Array.from(new Set(defs.map((d) => d.form_id)));
  const recordIds = records.map((r) => r.id);
  const completionsByKey = new Map<string, CivilDate[]>(); // key = formId|recordId
  if (recordIds.length > 0) {
    /*
     * PAGED, and sorted with a unique tiebreak (2026-07-30).
     *
     * This read had neither. PostgREST caps a response at 1000 rows, so a company with more
     * completion history than that silently lost the rest, and because the sort was ascending it
     * lost the NEWEST completions: every check would have read as though it had not been done for
     * months. `submitted_at` alone is also not a stable sort, so two runs could keep different
     * rows at the cut and produce two different numbers on the same day. Id is the tiebreak.
     */
    type EvRow = { id: string; form_id: string; record_id: string; submitted_at: string };
    /*
     * CHUNKED as well as paged. `.in("record_id", ids)` puts every id in the query string, and
     * now that the register is no longer capped at 1000 that list can run to a few thousand
     * UUIDs and blow the URL limit. A failed request would return no evidence at all, and every
     * check would then read as never completed: 0% across the board.
     */
    const IDS_PER_REQUEST = 200;
    for (let i = 0; i < recordIds.length; i += IDS_PER_REQUEST) {
      const idChunk = recordIds.slice(i, i + IDS_PER_REQUEST);
      const evQ = supabase
        .from("evidence")
        .select("id, form_id, record_id, submitted_at")
        .eq("company_id", input.companyId)
        .in("form_id", formIds)
        .in("record_id", idChunk)
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true });
      for (const e of await readAll<EvRow>(evQ, "evidence")) {
        const k = `${e.form_id}|${e.record_id}`;
        const list = completionsByKey.get(k) ?? [];
        list.push(tsToCivil(e.submitted_at));
        completionsByKey.set(k, list);
      }
    }
    // Chunking means the per record lists are built chunk by chunk. Each list only ever receives
    // rows for its own record, and those arrive ordered, so nothing needs re sorting.
  }

  // 4. Reconstruct cycles per definition per record and count.
  const statById = new Map<string, OnTimeStat>();
  const cycles: OnTimeCycle[] = [];
  const inWindow = (d: CivilDate) => compareCivil(d, fromC) >= 0 && compareCivil(d, toC) <= 0;

  for (const def of defs) {
    // Grade against the regulatory deadline when one is set on the check, otherwise
    // fall back to the operational recurrence interval. The register keeps using the
    // operational interval; only this report honours the regulatory deadline.
    const useReporting = def.reporting_interval_days != null && def.reporting_interval_days > 0;
    const dueFrom = (anchor: CivilDate): CivilDate =>
      useReporting
        ? addInterval(anchor, "day", def.reporting_interval_days as number)
        : addInterval(anchor, def.frequency, def.interval);
    const gradedAt = useReporting
      ? `${def.reporting_interval_days} days`
      : def.frequency === "day"
        ? `${def.interval} days`
        : `${def.interval} ${def.frequency}${def.interval === 1 ? "" : "s"}`;

    const stat: OnTimeStat = {
      checkId: def.id,
      checkKey: def.key,
      checkName: def.name,
      population: def.population,
      gradedAt,
      dueInPeriod: 0,
      onTime: 0,
      ratePct: null,
      band: null,
    };
    const recs = records.filter((r) => r.population === def.population);
    for (const rec of recs) {
      if (!rec.start) continue; // no anchor to start cycles from
      const comps = completionsByKey.get(`${def.form_id}|${rec.id}`) ?? []; // ascending, ordered by the query
      // The origin, then every completion, ascending and deduped. A start date must NEVER act
      // as the settlement of a cycle: see buildAnchors, which is unit tested.
      const anchors: CivilDate[] = buildAnchors(parseCivilDate(rec.start), comps);

      for (let k = 0; k < anchors.length; k++) {
        const next = k + 1 < anchors.length ? anchors[k + 1] : null;

        // EVERY cycle that came due in this gap, not just the first. The walk itself is pure
        // and unit tested in on-time-cycles.ts, which explains why this changed.
        const dues = dueDatesInGap({ anchor: anchors[k], next, today, from: fromC, step: dueFrom });

        for (let i = 0; i < dues.length; i++) {
          const d = dues[i];
          if (!inWindow(d)) continue;
          const { settled, onTime } = cycleOnTime(dues, i, next);
          stat.dueInPeriod += 1;
          if (onTime) stat.onTime += 1;
          cycles.push({
            checkKey: def.key,
            checkName: def.name,
            recordName: rec.name,
            branchName: rec.branch,
            dueDate: formatCivilDate(d),
            // `settled` already implies next is set; the extra check is for the type checker.
            completedOn: settled && next ? formatCivilDate(next) : null,
            onTime,
          });
        }
      }
    }
    stat.ratePct = floorPct(stat.onTime, stat.dueInPeriod);
    stat.band = pqsBand(stat.onTime, stat.dueInPeriod);
    statById.set(def.id, stat);
  }

  const stats = Array.from(statById.values());

  // PQS headline: the specific questions Cardiff scores, pulled together so the
  // manager reads one return. Supervision (Quality Q2) and care plan review (User
  // Experience Q1) come from the on-time cycles above; mandatory + safeguarding
  // training from the Training department; SCW registration is worked out here.
  /*
   * Judged at the END of the reporting period, not at today (2026-07-30).
   *
   * These two measures used to ignore the window entirely: change the dates and three rows moved
   * while four stood still, under a Period line claiming the whole table covered that range.
   */
  const asOf = parseCivilDate(win.to);
  const training = await getTrainingMatrix(input.companyId, input.branchId, win.to);
  const cutoff = formatCivilDate(addMonths(asOf, -6));
  let scwDenom = 0;
  let scwNum = 0;
  for (const p of staff) {
    if (!p.start_date || p.start_date > cutoff) continue; // 6+ months in post AT the period end
    scwDenom += 1;
    if (p.scw_registration_number && p.scw_registration_number.trim() !== "") scwNum += 1;
  }
  const scwPct = floorPct(scwNum, scwDenom);

  // Customer satisfaction: positive answers from the personal plan review feedback
  // questions across reviews completed in the same window (branch scoped to match).
  const satisfaction = await getSatisfaction(input.companyId, { from: win.from, to: win.to }, input.branchId);

  // Personal outcomes: percentage of service user outcomes achieved or progressing,
  // branch scoped to match this report.
  const outcomesReg = await getOutcomesRegister(input.companyId);
  const outcomeRows = input.branchId
    ? outcomesReg.rows.filter((r) => r.branch_id === input.branchId)
    : outcomesReg.rows;
  const outcomeInScope = outcomeRows.reduce((n, r) => n + r.total, 0);
  const outcomeAchieving = outcomeRows.reduce((n, r) => n + r.achievingOrProgressing, 0);
  const outcomesPct = floorPct(outcomeAchieving, outcomeInScope);

  // Two of the PQS measures are on-time checks already in the table, so we just
  // star those rows. The other three are not checks, so they are appended as their
  // own starred rows. Everything sits in the one On time completion rates box.
  const pqsStars: Record<string, string> = {
    supervision: "Quality Compliance Q2: three-monthly supervision completed by the due date.",
    care_plan_review: "User Experience Q1: three-monthly personal plan reviews completed by the due date.",
  };
  const extraMeasures: PqsMeasure[] = [
    {
      name: "Mandatory training",
      register: "People",
      gradedAt: "All courses",
      rate: training.summary.mandatoryCompliancePct,
      band: bandPct(training.summary.mandatoryCompliancePct),
      star: "Quality Compliance Q1: care workers in full compliance with mandatory training.",
    },
    {
      name: "Social Care Wales registration",
      register: "People",
      // A registration number carries no date, so this reads as it stands today against the staff
      // who had 6 months in post by the end of the period. Said on the row rather than implied.
      gradedAt: "6 months in post, registered as at today",
      rate: scwPct,
      band: bandPct(scwPct),
      star: "Quality Compliance Q3: staff 6+ months in post registered with Social Care Wales.",
    },
    {
      name: "Safeguarding training",
      register: "People",
      gradedAt: "Safeguarding course",
      rate: training.summary.safeguardingPct,
      band: bandPct(training.summary.safeguardingPct),
      star: "Safeguarding Q1: care workers completed mandatory safeguarding training.",
    },
    {
      name: "Customer satisfaction",
      register: "Service Users",
      gradedAt: "Plan reviews",
      rate: satisfaction.pct,
      band: bandPct(satisfaction.pct),
      star: "User Experience Q2: percentage customer satisfaction from service user feedback, last 6 months.",
    },
    {
      name: "Personal outcomes",
      register: "Service Users",
      // Outcomes carry a current status and no history, so this row is a position as at today
      // whatever period is asked for. The label says so rather than letting the Period line above
      // speak for it.
      gradedAt: "Achieved or progressing, as at today",
      rate: outcomesPct,
      band: bandPct(outcomesPct),
      star: "Supplier Performance Q2: percentage of service user personal outcomes achieved or progressing.",
    },
  ];

  return { win, stats, cycles, pqsStars, extraMeasures };
}

/**
 * ONE run of the engine per request, per scope.
 *
 * The dashboard now asks for these numbers twice: the PQS tiles want the measures, and the
 * Compliance score wants the on time rate per check. React's cache() dedupes on the ARGUMENTS,
 * which is why this takes primitives rather than the OnTimeInput object: two callers passing
 * equal object literals would miss the cache and run the whole engine twice.
 */
const onTimeRun = cache(
  async (
    companyId: string,
    branchId: string | null,
    branchName: string | null,
    from: string,
    to: string,
  ) =>
    // companyName is deliberately NOT part of the key: the computation never reads it, it only
    // titles the rendered document, so keying on it would buy two identical engine runs whenever
    // two callers spell the company differently.
    computeOnTime({ companyId, companyName: "", branchId, branchName, window: { from, to } }),
);

function runFor(input: OnTimeInput) {
  return onTimeRun(
    input.companyId,
    input.branchId,
    input.branchName,
    input.window.from,
    input.window.to,
  );
}

/**
 * The six month on time completion rate per check DEFINITION, for the Compliance score.
 *
 * Same computation as the PQS report, so a requirement's history and the PQS return can never
 * disagree. A check with nothing due in the window maps to null, not to zero: nothing due is not
 * a failure.
 */
export async function getOnTimeRatesByCheckId(
  companyId: string,
): Promise<Map<string, number | null>> {
  const win = defaultOnTimeWindow();
  const r = await runFor({ companyId, companyName: "", branchId: null, branchName: null, window: win });
  return new Map(r.stats.map((s) => [s.checkId, s.ratePct]));
}

export async function buildOnTimeReport(
  input: OnTimeInput,
): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const r = await runFor(input);
  if ("empty" in r && r.empty) return emptyReport(input, r.empty);
  return renderOnTimeDoc(input, r.win, r.stats, r.cycles, r.pqsStars, r.extraMeasures);
}

/**
 * Every measure Cardiff actually scores, as a flat list, for the dashboard.
 *
 * Two of them are on time completion rates from the cycles above; the rest are the appended
 * measures (training, safeguarding, SCW registration, satisfaction, personal outcomes). Same
 * numbers as the report, because it is the same computation.
 */
const PQS_RETURN_ORDER = [
  "Quality Compliance Q1",
  "Quality Compliance Q2",
  "Quality Compliance Q3",
  "Safeguarding Q1",
  "User Experience Q1",
  "User Experience Q2",
  "Supplier Performance Q2",
];

/**
 * Where a measure sits in the Cardiff return.
 *
 * WHY THIS EXISTS. The measures are assembled from two sources: starred rows from the on time
 * cycles, and the appended measures. The cycle rows arrive in whatever order Postgres hands
 * back, so without this the PQS lines changed places between page loads and the manager could
 * never learn the shape of the panel. Anything unrecognised sorts to the end by name, so a new
 * measure appears in a stable place instead of floating.
 */
function pqsOrderIndex(star: string): number {
  const i = PQS_RETURN_ORDER.findIndex((prefix) => star.startsWith(prefix));
  return i === -1 ? PQS_RETURN_ORDER.length : i;
}

export async function getPqsMeasures(input: OnTimeInput): Promise<PqsMeasure[]> {
  const { stats, pqsStars, extraMeasures } = await runFor(input);
  const starred: PqsMeasure[] = stats
    .filter((s) => pqsStars[s.checkKey])
    .map((s) => ({
      name: s.checkName,
      register: s.population === "people" ? "People" : "Service Users",
      gradedAt: s.gradedAt,
      rate: s.ratePct,
      band: s.band,
      star: pqsStars[s.checkKey],
    }));
  return [...starred, ...extraMeasures].sort((a, b) => {
    const d = pqsOrderIndex(a.star) - pqsOrderIndex(b.star);
    if (d !== 0) return d;
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.register.localeCompare(b.register);
  });
}

function bandCell(band: number | null) {
  if (band === null) return { text: "N/A", rag: "neutral" as const };
  // 10 green, 7 amber, everything else red (Phil, 2026-07-30). The same rule the dashboard tiles
  // use, because a band 5 reading amber in the PDF and red on screen is exactly the sort of
  // disagreement this module exists to prevent.
  const rag = band >= 10 ? "green" : band === 7 ? "amber" : "red";
  return { text: String(band), rag: rag as "green" | "amber" | "red" };
}

function rateCell(rate: number | null) {
  if (rate === null) return { text: "No cycles due", rag: "neutral" as const };
  const rag = rate >= 85 ? "green" : rate >= 50 ? "amber" : "red";
  /*
   * `${rate}%`, NOT toFixed(1) (2026-07-30). The dashboard tile prints 76% and this printed
   * 76.0%; identical numbers that read as a mismatch the moment somebody clicks a tile and
   * compares. The CSV already printed it this way, so the PDF was the odd one out of three.
   * The value is already rounded to one decimal upstream, so nothing is lost.
   */
  return { text: `${rate}%`, rag: rag as "green" | "amber" | "red" };
}

function popLabel(p: "people" | "service_users"): string {
  return p === "people" ? "People" : "Service Users";
}

function renderOnTimeDoc(
  input: { companyName: string; branchName: string | null },
  win: OnTimeWindow,
  stats: OnTimeStat[],
  cycles: OnTimeCycle[],
  pqsStars: Record<string, string>,
  extraMeasures: PqsMeasure[],
): { doc: ReportDoc; csv: string; base: string } {
  const scopeLabel = input.branchName ? input.branchName : "All branches";
  const period = `${fmtDate(win.from)} to ${fmtDate(win.to)}`;

  // Each summary row, tagged with its name and whether it is a starred PQS measure,
  // so the PQS scored (starred) items group at the top of the table.
  type SummaryEntry = { name: string; starred: boolean; star?: string; cells: ReportCell[] };
  const checkEntries: SummaryEntry[] = stats.map((s) => {
    const star = pqsStars[s.checkKey];
    return {
      name: s.checkName,
      starred: Boolean(star),
      star,
      cells: [
        { text: s.checkName, strong: true, ...(star ? { star } : {}) },
        { text: popLabel(s.population) },
        { text: s.gradedAt },
        { text: String(s.dueInPeriod) },
        { text: String(s.onTime) },
        rateCell(s.ratePct),
        bandCell(s.band),
      ],
    };
  });
  const measureEntries: SummaryEntry[] = extraMeasures.map((m) => ({
    name: m.name,
    starred: true,
    star: m.star,
    cells: [
      { text: m.name, strong: true, star: m.star },
      { text: m.register },
      { text: m.gradedAt },
      { text: "N/A" },
      { text: "N/A" },
      rateCell(m.rate),
      bandCell(m.band),
    ],
  }));
  const allEntries = [...checkEntries, ...measureEntries];
  /*
   * CARDIFF RETURN ORDER, not alphabetical (2026-07-30).
   *
   * The dashboard tiles list these seven measures in the order the return asks for them, and this
   * table used to list them alphabetically. Same numbers, different sequence, which reads as a
   * mismatch the moment somebody clicks a tile and compares the two lists line by line. One
   * order, from one function, so they can be read side by side.
   */
  const byReturnOrder = (a: SummaryEntry, b: SummaryEntry) =>
    pqsOrderIndex(a.star ?? "") - pqsOrderIndex(b.star ?? "") || a.name.localeCompare(b.name);
  // Only the items that actually count towards the PQS score (the starred measures).
  // Operational checks that are not PQS scored are left out.
  const summaryRows: ReportCell[][] = allEntries
    .filter((e) => e.starred)
    .sort(byReturnOrder)
    .map((e) => e.cells);

  // Breakdown: only the PQS scored checks (the starred ones), cycles that were NOT on
  // time first (the ones to action), then the rest.
  // By KEY, not by name: a people Audit and a service user Audit share a name, so filtering on
  // the name leaked one register's cycles into the other's breakdown.
  const starredKeys = new Set(stats.filter((s) => pqsStars[s.checkKey]).map((s) => s.checkKey));
  const sortedCycles = [...cycles]
    .filter((c) => starredKeys.has(c.checkKey))
    .sort(
      (a, b) => Number(a.onTime) - Number(b.onTime) || a.checkName.localeCompare(b.checkName) || a.dueDate.localeCompare(b.dueDate),
    );
  const breakdownRows = sortedCycles.map((c) => [
    { text: c.checkName },
    { text: c.recordName, strong: true },
    { text: c.branchName },
    { text: fmtDate(c.dueDate) },
    { text: c.completedOn ? fmtDate(c.completedOn) : "Not completed" },
    c.onTime ? { text: "On time", rag: "green" as const } : { text: "Late", rag: "red" as const },
  ]);

  const doc: ReportDoc = {
    title: "PQS report",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `PQS-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Period", value: period },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote:
      "Every row is a Cardiff PQS scored measure: Mandatory training (Quality Q1), Supervision (Quality Q2), Social Care Wales registration (Quality Q3), Care plan reviews (User Experience Q1), Customer satisfaction (User Experience Q2), Personal outcomes (Supplier Performance Q2), Safeguarding training (Safeguarding Q1). PQS score band: 100 percent is 10, 85 to 99.99 is 7, 70 to 84.99 is 5, 50 to 69.99 is 2, under 50 is 0. On time means completed on or before the due date (last completion plus the deadline shown in Graded at). The SCW rate counts only staff 6+ months in post at the end of the period, and their registration is read as it stands today. Training is judged at the end of the period. Personal outcomes carry no history, so that row is today's position. Every rate is rounded DOWN to one decimal, never up. Active records only, as the register stands today.",
    blocks: [
      { kind: "heading", text: "On time completion rates" },
      {
        kind: "table",
        emptyText: "No recurring check cycles fell due in this period.",
        columns: [
          { header: "Check", width: "24%" },
          { header: "Register", width: "13%" },
          { header: "Graded at", width: "12%" },
          { header: "Due in period", width: "13%", align: "right" },
          { header: "On time", width: "10%", align: "right" },
          { header: "On time rate", width: "14%" },
          { header: "PQS score", width: "14%" },
        ],
        rows: summaryRows,
      },
      { kind: "heading", text: "Breakdown by cycle", collapsible: true },
      {
        kind: "table",
        emptyText: "Nothing due in this period.",
        columns: [
          { header: "Check", width: "20%" },
          { header: "Record", width: "22%" },
          { header: "Branch", width: "16%" },
          { header: "Due", width: "16%" },
          { header: "Completed", width: "16%" },
          { header: "Result", width: "10%" },
        ],
        rows: breakdownRows,
      },
    ],
  };

  // Same order as the table and the dashboard tiles.
  const csvMeasures: Array<{ star: string; row: CsvCell[] }> = [
    ...stats
      .filter((s) => pqsStars[s.checkKey])
      .map((s) => ({
        star: pqsStars[s.checkKey],
        row: [
          "PQS + Summary",
          s.checkName,
          popLabel(s.population),
          s.gradedAt,
          s.dueInPeriod,
          s.onTime,
          s.ratePct === null ? "" : `${s.ratePct}%`,
          s.band === null ? "" : s.band,
          "",
          "",
        ] as CsvCell[],
      })),
    ...extraMeasures.map((m) => ({
      star: m.star,
      row: [
        "PQS",
        m.name,
        m.register,
        m.gradedAt,
        "",
        "",
        m.rate === null ? "" : `${m.rate}%`,
        m.band === null ? "" : m.band,
        "",
        "",
      ] as CsvCell[],
    })),
  ].sort((a, b) => pqsOrderIndex(a.star) - pqsOrderIndex(b.star));

  const csvRows: CsvCell[][] = [
    ...csvMeasures.map((m) => m.row),
    ...sortedCycles.map((c) => [
      "Cycle",
      c.checkName,
      "",
      "",
      "",
      "",
      "",
      "",
      c.recordName,
      `${c.branchName}; due ${fmtDate(c.dueDate)}; ${c.completedOn ? "completed " + fmtDate(c.completedOn) : "not completed"}; ${c.onTime ? "on time" : "late"}`,
    ] as CsvCell[]),
  ];
  const csv = buildCsv(
    ["Row", "Check", "Register", "Graded at", "Due in period", "On time", "On time rate", "PQS score", "Record", "Detail"],
    csvRows,
  );

  return { doc, csv, base: `on-time-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}` };
}

function emptyReport(
  input: { companyName: string; branchName: string | null; window: OnTimeWindow },
  note: string,
): { doc: ReportDoc; csv: string; base: string } {
  const scopeLabel = input.branchName ? input.branchName : "All branches";
  return {
    doc: {
      title: "PQS report",
      subtitle: `${input.companyName}, ${scopeLabel}`,
      meta: [
        { label: "Company", value: input.companyName },
        { label: "Scope", value: scopeLabel },
        { label: "Generated at", value: generatedAt() },
      ],
      blocks: [{ kind: "paragraph", text: note }],
    },
    csv: buildCsv(["Note"], [[note]]),
    base: `pqs-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}`,
  };
}
