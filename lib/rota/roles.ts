/**
 * Be Care Compliant: who sees the Rota department (Rota and Visits beta, Stage 0, 2026-10-15).
 *
 * The office roles that plan the rota. Carers (Care Assistant and Senior Care Assistant) reach
 * their own shifts and visits through the carer portal from Stage 1, never this department.
 * The Recruiter and the Viewer are left out until a stage needs them (ask Phil first: a new
 * permission edge, docs/decisions/permission-boundaries.md).
 *
 * Importless, so the nav (client safe) and the page guards share one list.
 */
export const ROTA_OFFICE_ROLES = [
  "platform_admin",
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
] as const;

export function isRotaOfficeRole(role: string | null | undefined): boolean {
  return !!role && (ROTA_OFFICE_ROLES as readonly string[]).includes(role);
}
