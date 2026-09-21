/**
 * Be Care Compliant — a company's own roles. Pure and deliberately IMPORTLESS, so node --test
 * can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-21): "lets add the roles to users and access, called that setting
 * tile Roles, users and access." The Recruiter is the reason it had to exist: he asked for one
 * role, and it took a code change, a migration and a deploy. A company should be able to name its
 * own without waiting for us.
 *
 * WHAT A CUSTOM ROLE IS. A NAMED NARROWING of a built-in role. A company names it, picks the
 * built-in role it copies, and unticks departments it must not reach. The person keeps the
 * BUILT-IN role in profiles.role — that is what every RLS policy reads, and what decides their
 * branch reach — and carries the custom role beside it as a label and a list of departments
 * switched off.
 *
 * WHY IT CANNOT GRANT. Every policy in the database names roles. A role called "Care
 * Coordinator" is a name the database has never heard of, so somebody carrying it alone would be
 * refused everywhere. Narrowing needs no policy to change; widening would mean every policy
 * reading a table instead of naming a role, which is the security model rewritten. 0314 says the
 * same thing at the other end.
 *
 * ONE VALUE IN THE FORM. Every role picker on the product posts a single `role` field. A custom
 * role travels in it as "custom:<id>" and is split back into the built-in role and the custom id
 * here, so no screen has to carry two fields that could disagree.
 */

/** A company's own role, as the screens and the gate need it. */
export type CustomRole = {
  id: string;
  name: string;
  /** The built-in role it copies. This is what goes in profiles.role. */
  baseRole: string;
  /** Department keys this role has switched off, beneath its base role's ceiling. */
  off: readonly string[];
};

/** How a custom role travels in a `role` form field. */
export const CUSTOM_ROLE_PREFIX = "custom:";

/**
 * The built-in roles a company may copy.
 *
 * NOT company_admin, for the same reason Settings is locked for an Admin: the first person to
 * narrow their own Admin would have no way back in. NOT staff: a carer's portal is its own tile,
 * with its own list of forms.
 */
export const COPYABLE_ROLES: readonly string[] = [
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
  "on_call",
  "team_member",
];

export function canCopyRole(role: string): boolean {
  return COPYABLE_ROLES.includes(role);
}

/** The value a role picker posts for this choice. */
export function roleChoiceValue(role: string, companyRoleId: string | null): string {
  return companyRoleId ? `${CUSTOM_ROLE_PREFIX}${companyRoleId}` : role;
}

/**
 * Split a posted `role` field back into the built-in role and the custom role, if any.
 *
 * Returns null for anything that is not a role this company has — an unknown id, a custom role
 * belonging to somebody else, a value somebody typed into the form — so a caller can refuse it
 * rather than having to decide what a half-understood value meant.
 */
export function parseRoleChoice(
  value: string,
  roles: readonly CustomRole[],
): { role: string; companyRoleId: string | null } | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith(CUSTOM_ROLE_PREFIX)) {
    return { role: raw, companyRoleId: null };
  }
  const id = raw.slice(CUSTOM_ROLE_PREFIX.length);
  const found = roles.find((r) => r.id === id);
  if (!found) return null;
  return { role: found.baseRole, companyRoleId: found.id };
}

/**
 * What to call this person's role on screen.
 *
 * Phil, asked and answered 2026-09-21: the custom name shows EVERYWHERE — the user list, the
 * invites, a colleague's record — and the built-in role it copies is visible only in Settings,
 * where somebody is deciding about roles rather than about a person.
 */
export function displayRoleLabel(builtInLabel: string, customName: string | null): string {
  const name = (customName ?? "").trim();
  return name || builtInLabel;
}

/**
 * The departments this PERSON cannot open: their company's switches for the built-in role, plus
 * whatever their custom role narrows further.
 *
 * Keyed on the BUILT-IN role, because that is the key canUseModule() asks with. That makes the
 * result personal to one viewer — it is the nav and the page gate for the person looking, never
 * the Settings screen, which shows every role's switches side by side and must not have one
 * person's narrowing folded into it.
 */
export function narrowedDisabled(
  companyDisabled: ReadonlySet<string>,
  role: string,
  custom: CustomRole | null,
): Set<string> {
  const out = new Set(companyDisabled);
  if (!custom) return out;
  for (const key of custom.off) out.add(`${role}|${key}`);
  return out;
}

/**
 * Why a role cannot be deleted yet (Phil, asked and answered 2026-09-21: refuse while in use).
 *
 * Deleting it and letting those people fall back to the built-in role would hand them back every
 * department the role had switched off, silently, which is the opposite of what somebody pressing
 * Delete is trying to do.
 */
export function deleteRefusal(name: string, inUse: number): string | null {
  if (inUse <= 0) return null;
  return inUse === 1
    ? `One person is on ${name}. Move them to another role first.`
    : `${inUse} people are on ${name}. Move them to another role first.`;
}
