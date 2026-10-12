/**
 * A login's name as typed on Settings, Users (Phil, 2026-10-12, docs/decisions/login-names.md).
 *
 * Spaces at either end go, and runs of spaces inside become one, so "Jo  Bloggs " saves as
 * "Jo Bloggs". The database function rename_login applies the same rule and the same limit, so a
 * name this accepts is never refused there for its shape.
 *
 * Pure and importless so node --test can load it.
 */
export const LOGIN_NAME_MAX = 120;

export function cleanLoginName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "Enter a name." };
  if (value.length > LOGIN_NAME_MAX) {
    return { ok: false, error: `Keep the name to ${LOGIN_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, value };
}
