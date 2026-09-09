import "server-only";

/**
 * Be Care Compliant — put a service user on the Invoicing books when the Setup Visit says we
 * are the ones who invoice this package.
 *
 * Phil, 2026-09-09: "if private, they need to be added to the private invoicing" — and which
 * funding types those are is the company's own tick box in Settings > Service Users.
 *
 * The Setup Visit is where the office finds out who is paying, and the one moment somebody
 * definitely knows. Leaving it to be typed into Invoicing later is how a package runs for
 * months unbilled: the visit happened, the care started, and nobody carried the fact across.
 *
 * WHAT "ADDED TO PRIVATE INVOICING" ACTUALLY IS. A first attempt at this wrote a row into
 * public.private_clients, which was wrong: the Invoicing department's client list is
 * listPrivateInvoicingClients, and that reads SERVICE USERS with private_invoicing = true.
 * /invoicing/clients/[id] redirects straight back to the service user record for the same
 * reason. So the flag on the service user IS the thing, and this sets it.
 *
 * The invoice_to / contact / address / delivery fields are deliberately left alone. They are
 * filled in on the record by somebody who knows them, and a guessed email is where the first
 * invoice would go.
 *
 * ONLY EVER TURNS IT ON, and only when it is off. It must never turn it off: a Setup Visit
 * re-done a year later, or corrected to a council funded answer, must not quietly take a
 * paying client off the books along with the delivery details somebody typed.
 *
 * SET ON EVERY TIER, including one without the Invoicing feature (Phil, 2026-09-09). Thistle
 * is on Black and cannot see the department. The flag is written anyway and stays invisible,
 * so a company that later moves to Pro finds its private clients already there rather than a
 * year of packages to key in.
 *
 * SERVICE ROLE, on purpose. A Supervisor can legitimately complete a Setup Visit but cannot
 * necessarily update the service user row or read the company's settings; under their own
 * client both would fail silently and nobody would ever be billed. Their authorisation is what
 * has already been established — they just completed a check on this service user.
 *
 * BEST EFFORT, like writeAudit and rebakeFormFieldOptions: the Setup Visit is Evidence and
 * must not fail because the billing side did. A failure is logged and swallowed.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { Answers } from "@/lib/form-schema";
import { billedFunding, type CompanyFunding } from "./setup-billing";

export async function ensurePrivateInvoicingFromSetup(opts: {
  companyId: string;
  serviceUserId: string;
  answers: Answers;
}): Promise<{ turnedOn: boolean; fundingLabel: string | null }> {
  const answer = opts.answers["funding_source"];
  if (typeof answer !== "string" || !answer) return { turnedOn: false, fundingLabel: null };

  try {
    const admin = createServiceClient();

    const { data: configured } = await admin
      .from("company_funding_options")
      .select("option_key, bills_privately, catalogue:funding_option_catalogue(label, payer_type)")
      .eq("company_id", opts.companyId);

    const options: CompanyFunding[] = (
      (configured as Array<{
        option_key: string;
        bills_privately: boolean;
        catalogue: { label: string; payer_type: "person" | "organisation" } | null;
      }> | null) ?? []
    ).map((row) => ({
      key: row.option_key,
      label: row.catalogue?.label ?? row.option_key,
      payerType: row.catalogue?.payer_type ?? "organisation",
      billsPrivately: row.bills_privately,
    }));

    const funding = billedFunding(answer, options);
    if (!funding) return { turnedOn: false, fundingLabel: null };

    // Already a client: leave everything alone, including whatever contact details the office
    // has typed. Turning it on twice is not the risk; overwriting is.
    const { data: su } = await admin
      .from("service_users")
      .select("private_invoicing")
      .eq("id", opts.serviceUserId)
      .maybeSingle();
    if (su?.private_invoicing === true) return { turnedOn: false, fundingLabel: funding.label };

    const { error } = await admin
      .from("service_users")
      .update({ private_invoicing: true })
      .eq("id", opts.serviceUserId);
    if (error) {
      console.error("[ensurePrivateInvoicingFromSetup] failed:", error.message);
      return { turnedOn: false, fundingLabel: funding.label };
    }
    return { turnedOn: true, fundingLabel: funding.label };
  } catch (e) {
    console.error("[ensurePrivateInvoicingFromSetup] failed:", (e as Error).message);
    return { turnedOn: false, fundingLabel: null };
  }
}
