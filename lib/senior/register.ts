/**
 * Be Care Compliant: a Senior's list, grouped for the screen (0339).
 *
 * senior_register returns one row per current record in the Senior's branches, and one row per
 * Check ticked on their tile for that record (the Check columns null when the record has none).
 * This turns those rows into branches, then names, then Checks, and says what each Check's pill
 * reads. Pure and importless so node --test can load it.
 */

export type SeniorRegisterRow = {
  record_id: string;
  full_name: string;
  branch_name: string | null;
  instance_id: string | null;
  check_name: string | null;
  check_key: string | null;
  check_order: number | null;
  due_date: string | null;
  last_completed_on: string | null;
  rag: string | null;
  has_form: boolean | null;
};

export type SeniorCheck = {
  instanceId: string;
  name: string;
  rag: "red" | "amber" | "green" | "none";
  dueDate: string | null;
  lastCompletedOn: string | null;
  hasForm: boolean;
};

export type SeniorRecord = { id: string; name: string; checks: SeniorCheck[] };
export type SeniorBranch = { name: string; records: SeniorRecord[] };

const RAGS = new Set(["red", "amber", "green", "none"]);

export function groupSeniorRegister(rows: readonly SeniorRegisterRow[]): SeniorBranch[] {
  const branches = new Map<string, Map<string, SeniorRecord>>();
  for (const r of rows) {
    if (!r.record_id || !r.full_name) continue;
    const branchKey = r.branch_name ?? "No branch";
    const records = branches.get(branchKey) ?? new Map<string, SeniorRecord>();
    branches.set(branchKey, records);
    const rec = records.get(r.record_id) ?? { id: r.record_id, name: r.full_name, checks: [] };
    records.set(r.record_id, rec);
    if (r.instance_id && r.check_name && !rec.checks.some((c) => c.instanceId === r.instance_id)) {
      rec.checks.push({
        instanceId: r.instance_id,
        name: r.check_name,
        rag: (RAGS.has(r.rag ?? "") ? r.rag : "none") as SeniorCheck["rag"],
        dueDate: r.due_date,
        lastCompletedOn: r.last_completed_on,
        hasForm: r.has_form === true,
      });
    }
  }
  // Rows arrive in register order (surname, then Check order); Maps keep insertion order.
  return [...branches.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, records]) => ({ name, records: [...records.values()] }));
}

/** What the pill says. No dashes, the register's own words. */
export function seniorPillLabel(c: Pick<SeniorCheck, "rag" | "lastCompletedOn">): string {
  if (c.rag === "red") return "Overdue";
  if (c.rag === "amber") return "Due soon";
  if (c.rag === "green") return "Compliant";
  return c.lastCompletedOn ? "Done" : "Not scheduled";
}

/** The pill's class: the RAG colours, and neutral when there is no due date. */
export function seniorPillClass(rag: SeniorCheck["rag"]): string {
  return rag === "red" ? "pill-red" : rag === "amber" ? "pill-amber" : rag === "green" ? "pill-green" : "pill-neutral";
}

/** The line under a form's button when a name has more than one: "Overdue, due 1 July 2026". */
export function seniorFormStatus(c: Pick<SeniorCheck, "rag" | "dueDate" | "lastCompletedOn">): string {
  if (c.dueDate) return `${seniorPillLabel(c)}, due ${longDate(c.dueDate)}`;
  if (c.lastCompletedOn) return `Done ${longDate(c.lastCompletedOn)}`;
  return seniorPillLabel(c);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

/** How many Checks on the list are overdue, for the line under the title. */
export function overdueCount(branches: readonly SeniorBranch[]): number {
  let n = 0;
  for (const b of branches) for (const r of b.records) for (const c of r.checks) if (c.rag === "red") n++;
  return n;
}
