/**
 * Be Care Compliant — is an outstanding check "due soon" on the Readiness page? (DEF-068)
 *
 * Found 2026-09-24 testing the Readiness assistant on Thistle: the same card said "11 due soon"
 * and listed 18 under Outstanding checks. The counts (get_framework_check_readiness, 0305/0321)
 * use each check's own amber window, as the registers do (Thistle: 14 days). The list used a flat
 * 30 days, so it named seven checks as due soon that the register, the dashboard and the count
 * above it all call on track. The list now uses the same window as the count.
 *
 * Pure and importless so it can be unit tested. Dates are ISO civil dates (YYYY-MM-DD).
 */

export function amberWindow(checkAmber: number | null | undefined, companyDefault: number | null | undefined): number {
  if (typeof checkAmber === "number" && checkAmber >= 0) return checkAmber;
  if (typeof companyDefault === "number" && companyDefault >= 0) return companyDefault;
  return 14;
}

/** Due today or later, and no more than `amberDays` days away. */
export function isDueSoon(dueIso: string, todayIso: string, amberDays: number): boolean {
  if (dueIso < todayIso) return false;
  const [y, m, d] = todayIso.split("-").map(Number);
  const edge = new Date(Date.UTC(y, m - 1, d + amberDays)).toISOString().slice(0, 10);
  return dueIso <= edge;
}
