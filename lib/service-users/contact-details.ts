/**
 * Be Care Compliant — a service user's home address and phone, read off a form.
 *
 * Phil, 2026-09-09: "add those questions to add service user and make them required
 * questions". Required is enforced HERE rather than only by the browser, because a
 * required attribute is a courtesy and the register is a regulatory record: CIW expects
 * to see where the care is delivered, and a blank slipped past by a resubmitted request
 * is a hole nobody notices until an inspection.
 *
 * The address is shaped like the form engine's `address` answer (ADDRESS_PARTS) so the
 * record prefills a review field for field with no translation in between.
 *
 * Isomorphic and pure — no side effects, so it is unit tested.
 */

import type { AddressValue } from "@/lib/form-schema";

export type ContactDetails = { address: AddressValue; phone: string };

function clean(v: FormDataEntryValue | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Pull the home address and phone out of submitted form data.
 * Returns an error sentence naming the FIRST thing missing, so the person is told one
 * clear thing to fix rather than a list.
 */
export function contactDetailsFromForm(
  get: (name: string) => FormDataEntryValue | null,
): { ok: true; values: ContactDetails } | { ok: false; error: string } {
  const line1 = clean(get("address_line1"));
  const line2 = clean(get("address_line2"));
  const city = clean(get("address_city"));
  const county = clean(get("address_county"));
  const postcode = clean(get("address_postcode"));
  const phone = clean(get("phone"));

  if (!line1) return { ok: false, error: "Enter the first line of their address." };
  if (!city) return { ok: false, error: "Enter the town or city." };
  if (!postcode) return { ok: false, error: "Enter the postcode." };
  if (!phone) return { ok: false, error: "Enter a phone number." };

  return {
    ok: true,
    values: {
      // Only the parts that were filled in: an address holding empty strings prints as
      // stray commas wherever it is formatted.
      address: {
        line1,
        ...(line2 ? { line2 } : {}),
        city,
        ...(county ? { county } : {}),
        postcode,
      },
      phone,
    },
  };
}
