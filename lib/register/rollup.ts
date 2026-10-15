/**
 * Be Care Compliant: a Record's rollup (worst colour across its checks), worked out from the
 * status rows the register has already read, instead of a second read of person_rollup_all or
 * service_user_rollup_all (speed plan, Push 4, 2026-10-15; docs/decisions/speed-plan.md).
 *
 * The rules are the views' own, line for line:
 * - person_rollup_all: red if any red, else amber if any amber, else "none" when there are no
 *   checks, else green.
 * - service_user_rollup_all: the same, with "paused" after amber (0461, 0462).
 * total_checks counts every check; the colour counts count only that colour.
 * Importless so it runs under node --test.
 */

type StatusLike = { rag: string | null };

export type RollupCounts = {
  total_checks: number;
  red_count: number;
  amber_count: number;
  green_count: number;
  paused_count: number;
};

export function rollupCounts(statuses: StatusLike[]): RollupCounts {
  const c: RollupCounts = { total_checks: 0, red_count: 0, amber_count: 0, green_count: 0, paused_count: 0 };
  for (const s of statuses) {
    c.total_checks += 1;
    if (s.rag === "red") c.red_count += 1;
    else if (s.rag === "amber") c.amber_count += 1;
    else if (s.rag === "green") c.green_count += 1;
    else if (s.rag === "paused") c.paused_count += 1;
  }
  return c;
}

/** person_rollup_all's rag. */
export function personRollupRag(c: RollupCounts): "red" | "amber" | "green" | "none" {
  if (c.red_count > 0) return "red";
  if (c.amber_count > 0) return "amber";
  if (c.total_checks === 0) return "none";
  return "green";
}

/** service_user_rollup_all's rag. */
export function serviceUserRollupRag(c: RollupCounts): "red" | "amber" | "green" | "none" | "paused" {
  if (c.red_count > 0) return "red";
  if (c.amber_count > 0) return "amber";
  if (c.paused_count > 0) return "paused";
  if (c.total_checks === 0) return "none";
  return "green";
}

/** Group status rows by their Record id. */
export function groupByRecord<T>(rows: T[], idOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const id = idOf(r);
    const list = out.get(id);
    if (list) list.push(r);
    else out.set(id, [r]);
  }
  return out;
}
