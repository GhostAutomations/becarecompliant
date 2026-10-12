/**
 * The two letters in the round profile button, top right (Phil, 2026-10-12: "like in Microsoft
 * where they have a circle with the initials").
 *
 * First letter of the first name and first letter of the surname, so "ZZ Test Supervisor" is
 * ZS and "Mary-Anne O'Brien" is MO. A single name gives one letter. With no usable name it
 * falls back to the first letter of the email address, and "?" when there is nothing at all.
 *
 * Pure and importless so node --test can load it.
 */
export function avatarInitials(fullName: string | null | undefined, email?: string | null): string {
  const parts = (fullName ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p.length > 0);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  const fromEmail = (email ?? "").replace(/[^\p{L}]/gu, "");
  return fromEmail ? fromEmail[0].toUpperCase() : "?";
}
