import "server-only";

/**
 * Be Care Compliant — put a service user on the Invoicing books when the Setup Visit says
 * somebody is paying us directly.
 *
 * Phil, 2026-09-09: "if private, they need to be added to the private invoicing" — and, the
 * same day, WHICH funding types those are is the company's own tick box in
 * Settings > Service Users, not a list in the code.
 *
 * The Setup Visit is where the office finds out who is paying, and it is the one moment when
 * somebody definitely knows. Leaving it to be typed into Invoicing later is how a package
 * runs for three months unbilled — the visit happened, the care started, and nobody carried
 * the fact across.
 *
 * WHAT IT CREATES: a Private Client linked to the service user, named after them, in their
 * branch. The billing contact, address and payment terms are deliberately left EMPTY, and the
 * note says so. A record that says what it does not know is safe; a record with a guessed
 * email is not, because the first invoice goes to it.
 *
 * IDEMPOTENT. A Setup Visit can be completed again — corrected, re-done after a false start —
 * and must not leave two payers behind. One client per service user is the rule; if one
 * already exists, however it was created, this does nothing at all and never overwrites what
 * the office has typed.
 *
 * CREATED EVEN ON A TIER WITHOUT INVOICING (Phil, 2026-09-09). Thistle is on Black and cannot
 * see the department. The record is written anyway and simply stays invisible, so a company
 * that later moves to Pro finds its private clients already there rather than an empty
 * department and a year of packages to key in. Nothing on screen mentions a feature they do
 * not have.
 *
 * SERVICE ROLE, on purpose. private_clients_insert admits a company admin or a branch
 * manager, and a Supervisor can legitimately complete a Setup Visit. Under the user's own
 * client that insert would be refused silently, so the caller's authorisation is what has
 * already been established — they just completed a check on this service user — and the write
 * goes through the service role.
 *
 * BEST EFFORT, like writeAudit and rebakeFormFieldOptions: the Setup Visit is Evidence and
 * must not fail because the billing side did. A failure is logged and swallowed.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { Answers } from "@/lib/form-schema";
import { billedFunding, payerNameFor, payerNoteFor, type CompanyFunding } from "./setup-billing";

export async function ensurePrivateClientFromSetup(opts: {
  companyId: string;
  serviceUserId: string;
  branchId: string | null;
  answers: Answers;
  actorId: string;
  /** Today in London, so the note's date agrees with the rest of the product. */
  todayIso: string;
}): Promise<void> {
  const answer = opts.answers["funding_source"];
  if (typeof answer !== "string" || !answer) return;
  if (!opts.branchId) return; // private_clients.branch_id is NOT NULL; nothing to attach to.

  try {
    const admin = createServiceClient();

    // What THIS company has said it invoices itself. Read through the service role for the
    // same reason the insert is: a Supervisor completing the visit cannot necessarily read
    // the company's settings, and a silent empty read would mean nobody is ever billed.
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
    if (!funding) return;

    // One payer per service user. Archived ones count too: re-creating a client somebody
    // deliberately archived would quietly put them back on the books.
    const { data: existing } = await admin
      .from("private_clients")
      .select("id")
      .eq("service_user_id", opts.serviceUserId)
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: su } = await admin
      .from("service_users")
      .select("full_name")
      .eq("id", opts.serviceUserId)
      .maybeSingle();

    const { error } = await admin.from("private_clients").insert({
      company_id: opts.companyId,
      branch_id: opts.branchId,
      client_type: funding.payerType,
      name: payerNameFor(funding, (su?.full_name as string | null) ?? ""),
      service_user_id: opts.serviceUserId,
      notes: payerNoteFor(funding, opts.todayIso),
      created_by: opts.actorId,
      updated_by: opts.actorId,
    });
    if (error) {
      console.error("[ensurePrivateClientFromSetup] failed:", error.message);
    }
  } catch (e) {
    console.error("[ensurePrivateClientFromSetup] failed:", (e as Error).message);
  }
}
