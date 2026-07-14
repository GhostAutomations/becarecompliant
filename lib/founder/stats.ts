// Pure helpers for the founder platform-statistics dashboard.
// No "use server" here: these are plain functions/consts, safe to import into
// server components. Date bucketing is Europe/London to match usage_monthly
// (which truncates at Europe/London) and the rest of the platform.

export type CompanyLike = {
  tier: string;
  status: string;
  created_at: string;
};

/** The London year-month key ("YYYY-MM") for a timestamp. */
export function londonMonthKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // en-CA gives ISO-ish YYYY-MM-DD; slice to YYYY-MM.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .slice(0, 7);
}

/** A short label ("Jul 2026") for a "YYYY-MM" key. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The last `count` London month keys, oldest first, ending on the current month. */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  const current = londonMonthKey(now);
  const [y, m] = current.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Sign-ups per month across a fixed window, oldest first. */
export function buildSignupSeries(
  companies: CompanyLike[],
  months: number,
  now: Date = new Date(),
): { key: string; label: string; count: number }[] {
  const keys = recentMonthKeys(months, now);
  const tally = new Map<string, number>();
  for (const c of companies) {
    const k = londonMonthKey(c.created_at);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return keys.map((key) => ({
    key,
    label: monthKeyLabel(key),
    count: tally.get(key) ?? 0,
  }));
}

/** Tally rows by a derived key, in a fixed display order (unknown values appended). */
export function tallyBy<T>(
  rows: T[],
  get: (row: T) => string,
  order: readonly string[],
): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = get(r) ?? "unknown";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const out: { key: string; count: number }[] = [];
  for (const k of order) {
    seen.add(k);
    out.push({ key: k, count: counts.get(k) ?? 0 });
  }
  for (const [k, c] of counts) {
    if (!seen.has(k)) out.push({ key: k, count: c });
  }
  return out;
}
