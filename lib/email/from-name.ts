/**
 * Be Care Compliant — an invoice email comes FROM the care company (Phil, 2026-10-13: "the invoice
 * and email shouldn't be Be Care Compliant branded. It should be branded as per the company").
 *
 * The address stays our verified sending address (RESEND_FROM); only the name the inbox shows is
 * the company's. Sending from the company's own domain stays parked (docs/decisions/invoicing.md).
 * Pure and importless, so node --test runs it.
 */

/** The bare address from "Name <a@b>" or "a@b". */
export function fromAddress(from: string): string {
  const m = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (m ? m[1] : from).trim();
}

/** "\"Thistle Care Ltd\" <noreply@...>": the company's name on our sending address. Quoted, so a
 *  name with a full stop or comma is still one name; anything that could break the header is
 *  taken out. Falls back to the original From when there is no usable name. */
export function fromWithName(name: string | null | undefined, from: string): string {
  const clean = String(name ?? "")
    .replace(/["<>\\\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70)
    .trim();
  const addr = fromAddress(from);
  if (!clean || !addr.includes("@")) return from;
  return `"${clean}" <${addr}>`;
}
