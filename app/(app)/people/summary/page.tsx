import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import ViewNav from "@/components/people/view-nav";
import ComplianceCards from "@/components/people/compliance-cards";
import { listBranches, listRegister, getSupervisionCycleMode } from "@/lib/people/data";
import { supervisionSlots, appraisalSlot } from "@/lib/people/logic";
import { DEFAULT_AMBER_DAYS } from "@/lib/recurrence";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { ragFor, worseRag, type CardLine, type CardRag, type PersonCard } from "@/lib/people/summary-card";

export const metadata: Metadata = { title: "Compliance Summary" };

/**
 * EVERY PERSON, ONE SCREEN (Phil, 2026-09-09: "we just have three boxes. i want this so all
 * people can be seen in one spot").
 *
 * The three counts that were here said how many people were overdue and never which ones, so
 * the only thing to do with the page was leave it for the matrix. They are gone: a manager
 * opening this wants the names.
 *
 * Everything a card shows is already loaded by the register query, and the supervision and
 * appraisal positions come from the SAME functions the record and the matrix use, so a card
 * cannot say one thing while the record says another.
 */
export default async function PeopleSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { profile } = await requireCompany();
  // Same guard as the People register this summarises: care workers go to their own area,
  // on_call to theirs. Without it a staff login saw the summary view and the branch list.
  if (profile.role === "staff") redirect("/my");
  if (profile.role === "on_call") redirect("/on-call");
  if (!profile.company_id) {
    return (
      <div className="page-shell">
        <h1 className="page-title">Compliance Summary</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view its compliance summary.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch } = await searchParams;
  const branchId = branch || null;

  const [branches, register, cycleMode] = await Promise.all([
    listBranches(companyId, profile),
    listRegister(companyId, branchId, "active"),
    getSupervisionCycleMode(companyId),
  ]);
  const { definitions, rows } = register;

  const defByKey = Object.fromEntries(definitions.map((d) => [d.key, d]));
  const supInterval = defByKey["supervision"]?.interval ?? 90;
  const supAmber = defByKey["supervision"]?.amber_days ?? DEFAULT_AMBER_DAYS;
  const rtwAmber = defByKey["right_to_work"]?.amber_days ?? DEFAULT_AMBER_DAYS;
  const probationAmber = defByKey["probation_review"]?.amber_days ?? 14;
  const supCount = cycleMode === "four_supervisions" ? 4 : 3;
  const today = formatCivilDate(todayInLondon());

  const cards: PersonCard[] = rows.map((row) => {
    const t = row.tracker;
    const slots = supervisionSlots(
      supInterval,
      row.supCompDates,
      supAmber,
      row.appraisalCompDates,
      t?.probation_end_actual ?? null,
      undefined,
      supCount,
      cycleMode,
    );
    const aa = appraisalSlot(row.appraisalCompDates, row.supCompDates, supInterval, supAmber);

    /* The stage chips, left to right as the year runs: probation end, then each supervision,
       then the appraisal that closes the cycle. Green once done, otherwise the colour of what
       it is waiting on. */
    const probationDone = t?.probation_status === "passed";
    const chips = [
      {
        label: "PE",
        rag: probationDone
          ? ("green" as CardRag)
          : ragFor(t?.probation_end_due ?? null, today, probationAmber),
      },
      ...slots.map((s) => ({
        label: `S${s.n}`,
        rag: (s.comp ? "green" : (s.rag as CardRag)) as CardRag,
      })),
      ...(cycleMode === "appraisal"
        ? [{ label: "AA", rag: (aa.comp ? "green" : (aa.nextDueRag as CardRag)) as CardRag }]
        : []),
    ];

    const byKey = row.statusByKey;
    const line = (label: string, due: string | null, rag: CardRag, done = false): CardLine => ({
      label,
      due,
      rag,
      done,
    });

    const lines: CardLine[] = [
      line("Spot Check", byKey["spot_check"]?.due_date ?? null, (byKey["spot_check"]?.rag as CardRag) ?? "none"),
      line("Manual Handling", byKey["manual_handling"]?.due_date ?? null, (byKey["manual_handling"]?.rag as CardRag) ?? "none"),
      line("Medication Competency", byKey["competency"]?.due_date ?? null, (byKey["competency"]?.rag as CardRag) ?? "none"),
      line("Audit", byKey["audit"]?.due_date ?? null, (byKey["audit"]?.rag as CardRag) ?? "none"),
      line("DBS", t?.dbs_date ?? null, "none"),
      line("RTW expiry", t?.rtw_expiry_date ?? null, ragFor(t?.rtw_expiry_date ?? null, today, rtwAmber)),
      probationDone
        ? line("Probation", null, "green", true)
        : line("Probation", t?.probation_end_due ?? null, ragFor(t?.probation_end_due ?? null, today, probationAmber)),
    ];

    /* The badge is the next thing they OWE: the active supervision slot, or the appraisal when
       the cycle is waiting on that instead. */
    const active = slots.find((s) => !s.comp && s.due) ?? null;
    const nextLabel = active ? `SUP ${active.n}` : aa.nextDue ? "AA" : null;
    const nextDue = active ? active.due : aa.nextDue;
    const nextRag: CardRag = active
      ? ((active.rag as CardRag) ?? "none")
      : ((aa.nextDueRag as CardRag) ?? "none");

    const scheduledLines = lines.filter((l) => l.due || l.done);
    const worst = [...chips.map((c) => c.rag), ...lines.map((l) => l.rag)].reduce<CardRag>(
      (acc, r) => worseRag(acc, r),
      "none",
    );

    return {
      id: row.person.id,
      name: row.person.full_name,
      subtitle:
        [row.person.job_title, row.person.branch_name].filter(Boolean).join(" · ") ||
        "Staff record",
      chips,
      lines,
      nextLabel,
      nextDue,
      nextRag,
      inDate: scheduledLines.filter((l) => l.done || l.rag === "green").length,
      scheduled: scheduledLines.length,
      worst,
    };
  });

  return (
    <div className="page-shell space-y-6">
      <RealtimeRefresh />
      <div>
        <h1 className="page-title">Compliance Summary</h1>
        <p className="page-subtitle mt-1">
          Everyone on the register, worst first. Click a name to open their record.
        </p>
      </div>

      <ViewNav current="summary" branchId={branchId} branches={branches} />

      <ComplianceCards cards={cards} today={today} />
    </div>
  );
}
