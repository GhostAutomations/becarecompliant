/**
 * Be Care Compliant: per company module switches (0487, Rota and Visits beta, Phil 2026-10-15).
 *
 * A module is a part of the product the Founder switches on company by company, off by default.
 * The switch rows ride along inside the company row the app already reads once per request
 * (lib/companies/row.ts embeds company_modules), so asking "is it on?" costs no extra query on
 * any page, for any company, whether the module is on or off.
 *
 * Pure and importless, so it is unit tested without a database (switch.test.ts).
 */

export type ModuleKey = "rota_visits";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  rota_visits: "Rota and Visits (beta)",
};

type SwitchRow = { module?: unknown; enabled?: unknown };

/**
 * Is this module on, judged from a company row carrying its company_modules embed? Fails closed:
 * no row, no embed, a malformed embed or a missing switch all mean off.
 */
export function moduleOnInRow(
  row: { company_modules?: unknown } | null | undefined,
  module: ModuleKey,
): boolean {
  const list = row?.company_modules;
  if (!Array.isArray(list)) return false;
  return list.some((m: SwitchRow | null) => m?.module === module && m?.enabled === true);
}
