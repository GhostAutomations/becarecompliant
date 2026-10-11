/**
 * Be Care Compliant — is a stored file inside this company's own folder? (security audit of
 * 10 October 2026, finding F1.)
 *
 * Every stored file lives under "<company id>/...". The download routes used to check only that
 * the ROW belonged to the caller's company and then sign whatever path the row held with the
 * service role, so a row repointed at another company's file handed that file out. Migration 0443
 * now refuses any stored path outside its row's company; this is the same rule in code, checked
 * before a path is signed or read with the service role, so one guard can fail and the other
 * still holds.
 *
 * Importless, so `npm test` can run it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `path` is a file inside `companyId`'s folder: no other folder, no '..', no backslash. */
export function pathInCompany(path: unknown, companyId: unknown): boolean {
  if (typeof path !== "string" || typeof companyId !== "string") return false;
  if (!UUID.test(companyId)) return false;
  const prefix = `${companyId.toLowerCase()}/`;
  if (!path.startsWith(prefix) || path.length <= prefix.length) return false;
  if (path.includes("\\")) return false;
  return !path.split("/").some((segment) => segment === "..");
}

/** The words shown when a path fails the check. */
export const PATH_REFUSED = "That file is not in this company's storage.";
