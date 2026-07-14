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
 *   anchors = [record start date, ...completion dates sorted]
 *   for each anchor a_k: due_k = a_k + interval; the cycle is satisfied by the
 *   NEXT completion a_(k+1). On time if a_(k+1) exists and is on or before due_k.
 *   A cycle with no later completion and due_k in the past is overdue (not on
 *   time). Open cycles still in the future are not yet resolved and are excluded.
 *
 * Reads through the caller's RLS client (branch scoped for managers). Active
 * records only. No dashes in copy.
 */

import { createClient } from "@/lib/supabase/server";
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
import type { ReportBlock, ReportDoc } from "@/lib/export/pdf";
import { fmtDate, generatedAt } from "@/lib/export/format";

export type OnTimeWindow = { from: string; to: string };

export type OnTimeStat = {
  checkKey: string;
  checkName: string;
  population: "people" | "service_users";
  dueInPeriod: number;
  onTime: number;
  ratePct: number | null; // 0..100, null when nothing fell due
  band: number | null; // PQS score 0/2/5/7/10
};

export type OnTimeCycle = {
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

/** PQS score band from a percentage. 100 = 10, 85 to 99.99 = 7, 70 to 84.99 = 5,
 *  50 to 69.99 = 2, under 50 = 0. */
function pqsBand(onTime: number, total: number): number | null {
  if (total === 0) return null;
  if (onTime >= total) return 10; // exactly 100 percent
  const pct = (onTime / total) * 100;
  if (pct >= 85) return 7;
  if (pct >= 70) return 5;
  if (pct >= 50) return 2;
  return 0;
}

type DefRow = {
  id: string;
  key: string;
  name: string;
  population: "people" | "service_users";
  form_id: string;
  frequency: Frequency;
  interval: number;
};

/** London civil date of an evidence timestamp. */
function tsToCivil(ts: string): CivilDate {
  return civilDateInLondon(new Date(ts));
}

export async function buildOnTimeReport(input: {
  companyId: string;
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  window: OnTimeWindow;
}): Promise<{ doc: ReportDoc; csv: string; base: string }> {
  const supabase = await createClient();
  const win = input.window;
  const today = todayInLondon();
  const fromC = parseCivilDate(win.from);
  const toC = parseCivilDate(win.to);

  // 1. Recurring, form backed check definitions (a supervision / review has a form
  //    and an interval; one off checks like Setup, interval <= 0, are excluded).
  const { data: defsRaw } = await supabase
    .from("check_definitions")
    .select("id, key, name, population, form_id, frequency, interval")
    .eq("company_id", input.companyId)
    .eq("active", true)
    .eq("recurring", true)
    .not("form_id", "is", null)
    .gt("interval", 0);
  const defs = (defsRaw as unknown as DefRow[] | null)?.filter((d) => d.form_id) ?? [];
  if (defs.length === 0) {
    return emptyReport(input, "No recurring checks are configured for this company.");
  }

  // 2. Active records (branch scoped by RLS + the optional branch filter).
  let peopleQ = supabase
    .from("people")
    .select("id, full_name, branch_id, start_date, branches(name)")
    .eq("company_id", input.companyId)
    .is("archived_at", null)
    .neq("employment_status", "leaver");
  let suQ = supabase
    .from("service_users")
    .select("id, full_name, branch_id, package_start_date, branches(name)")
    .eq("company_id", input.companyId)
    .is("archived_at", null)
    .neq("service_status", "cancelled");
  if (input.branchId) {
    peopleQ = peopleQ.eq("branch_id", input.branchId);
    suQ = suQ.eq("branch_id", input.branchId);
  }
  const [{ data: peopleRaw }, { data: suRaw }] = await Promise.all([peopleQ, suQ]);

  type Rec = { id: string; name: string; branch: string; start: string | null; population: "people" | "service_users" };
  type PersonRaw = { id: string; full_name: string; start_date: string | null; branches: { name: string } | null };
  type SuRaw = { id: string; full_name: string; package_start_date: string | null; branches: { name: string } | null };
  const records: Rec[] = [
    ...((peopleRaw as unknown as PersonRaw[] | null) ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      branch: p.branches?.name ?? input.branchName ?? "",
      start: p.start_date,
      population: "people" as const,
    })),
    ...((suRaw as unknown as SuRaw[] | null) ?? []).map((s) => ({
      id: s.id,
      name: s.full_name,
      branch: s.branches?.name ?? input.branchName ?? "",
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
    const { data: evRaw } = await supabase
      .from("evidence")
      .select("form_id, record_id, submitted_at")
      .eq("company_id", input.companyId)
      .in("form_id", formIds)
      .in("record_id", recordIds)
      .order("submitted_at", { ascending: true });
    for (const e of (evRaw as { form_id: string; record_id: string; submitted_at: string }[] | null) ?? []) {
      const k = `${e.form_id}|${e.record_id}`;
      const list = completionsByKey.get(k) ?? [];
      list.push(tsToCivil(e.submitted_at));
      completionsByKey.set(k, list);
    }
  }

  // 4. Reconstruct cycles per definition per record and count.
  const statByKey = new Map<string, OnTimeStat>();
  const cycles: OnTimeCycle[] = [];
  const inWindow = (d: CivilDate) => compareCivil(d, fromC) >= 0 && compareCivil(d, toC) <= 0;

  for (const def of defs) {
    const stat: OnTimeStat = {
      checkKey: def.key,
      checkName: def.name,
      population: def.population,
      dueInPeriod: 0,
      onTime: 0,
      ratePct: null,
      band: null,
    };
    const recs = records.filter((r) => r.population === def.population);
    for (const rec of recs) {
      if (!rec.start) continue; // no anchor to start cycles from
      const comps = completionsByKey.get(`${def.form_id}|${rec.id}`) ?? [];
      const anchors: CivilDate[] = [parseCivilDate(rec.start), ...comps];
      for (let k = 0; k < anchors.length; k++) {
        const due = addInterval(anchors[k], def.frequency, def.interval);
        const next = k + 1 < anchors.length ? anchors[k + 1] : null;
        const overduePast = next === null && compareCivil(due, today) < 0;
        if (next === null && !overduePast) continue; // open cycle, not yet due
        if (!inWindow(due)) continue;
        const onTime = next !== null && compareCivil(next, due) <= 0;
        stat.dueInPeriod += 1;
        if (onTime) stat.onTime += 1;
        cycles.push({
          checkName: def.name,
          recordName: rec.name,
          branchName: rec.branch,
          dueDate: formatCivilDate(due),
          completedOn: next ? formatCivilDate(next) : null,
          onTime,
        });
      }
    }
    stat.ratePct = stat.dueInPeriod === 0 ? null : Math.round((stat.onTime / stat.dueInPeriod) * 1000) / 10;
    stat.band = pqsBand(stat.onTime, stat.dueInPeriod);
    statByKey.set(def.key, stat);
  }

  const stats = Array.from(statByKey.values());
  return renderOnTimeDoc(input, win, stats, cycles);
}

function bandCell(band: number | null) {
  if (band === null) return { text: "N/A", rag: "neutral" as const };
  const rag = band >= 10 ? "green" : band >= 5 ? "amber" : "red";
  return { text: String(band), rag: rag as "green" | "amber" | "red" };
}

function rateCell(rate: number | null) {
  if (rate === null) return { text: "No cycles due", rag: "neutral" as const };
  const rag = rate >= 85 ? "green" : rate >= 50 ? "amber" : "red";
  return { text: `${rate.toFixed(1)}%`, rag: rag as "green" | "amber" | "red" };
}

function popLabel(p: "people" | "service_users"): string {
  return p === "people" ? "People" : "Service Users";
}

function renderOnTimeDoc(
  input: { companyName: string; branchName: string | null },
  win: OnTimeWindow,
  stats: OnTimeStat[],
  cycles: OnTimeCycle[],
): { doc: ReportDoc; csv: string; base: string } {
  const scopeLabel = input.branchName ? input.branchName : "All branches";
  const period = `${fmtDate(win.from)} to ${fmtDate(win.to)}`;

  const summaryRows = stats.map((s) => [
    { text: s.checkName, strong: true },
    { text: popLabel(s.population) },
    { text: String(s.dueInPeriod) },
    { text: String(s.onTime) },
    rateCell(s.ratePct),
    bandCell(s.band),
  ]);

  // Breakdown: the cycles that were NOT on time first (the ones to action), then all.
  const sortedCycles = [...cycles].sort(
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
    title: "Compliance on time report",
    subtitle: `${input.companyName}, ${scopeLabel}`,
    reference: `ONTIME-${new Date().toISOString().slice(0, 10)}`,
    meta: [
      { label: "Company", value: input.companyName },
      { label: "Scope", value: scopeLabel },
      { label: "Period", value: period },
      { label: "Generated at", value: generatedAt() },
    ],
    footerNote:
      "On time means a check cycle was completed on or before its due date (last completion plus the interval). Active records only. PQS score band: 100 percent is 10, 85 to 99.99 is 7, 70 to 84.99 is 5, 50 to 69.99 is 2, under 50 is 0.",
    blocks: [
      { kind: "heading", text: "On time completion rates" },
      {
        kind: "table",
        emptyText: "No recurring check cycles fell due in this period.",
        columns: [
          { header: "Check", width: "28%" },
          { header: "Register", width: "16%" },
          { header: "Due in period", width: "14%", align: "right" },
          { header: "On time", width: "12%", align: "right" },
          { header: "On time rate", width: "16%" },
          { header: "PQS score", width: "14%" },
        ],
        rows: summaryRows,
      },
      { kind: "heading", text: "Breakdown by cycle" },
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

  const csvRows: CsvCell[][] = [
    ...stats.map((s) => [
      "Summary",
      s.checkName,
      popLabel(s.population),
      s.dueInPeriod,
      s.onTime,
      s.ratePct === null ? "" : `${s.ratePct}%`,
      s.band === null ? "" : s.band,
      "",
      "",
    ] as CsvCell[]),
    ...sortedCycles.map((c) => [
      "Cycle",
      c.checkName,
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
    ["Row", "Check", "Register", "Due in period", "On time", "On time rate", "PQS score", "Record", "Detail"],
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
      title: "Compliance on time report",
      subtitle: `${input.companyName}, ${scopeLabel}`,
      meta: [
        { label: "Company", value: input.companyName },
        { label: "Scope", value: scopeLabel },
        { label: "Generated at", value: generatedAt() },
      ],
      blocks: [{ kind: "paragraph", text: note }],
    },
    csv: buildCsv(["Note"], [[note]]),
    base: `on-time-${scopeLabel.replace(/\s+/g, "-").toLowerCase()}`,
  };
}
