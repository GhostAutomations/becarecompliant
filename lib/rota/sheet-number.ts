/**
 * Our text number as a carer would dial it: +447700900123 becomes 07700 900123. Pure and
 * importless (lib/rota/sheet-number.test.ts).
 */
export function ukMobileFromE164(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const d = e164.replace(/[^0-9+]/g, "");
  const m = d.match(/^\+44(7\d{9})$/);
  if (!m) return null;
  const local = `0${m[1]}`;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}
