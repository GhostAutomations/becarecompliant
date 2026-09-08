"use server";

/**
 * Be Care Compliant -- a Team Member records money they handled.
 *
 * THE ONLY FORM A CARER FILLS IN THEMSELVES (Phil's rule, standing). Everything else in the
 * product is a manager writing about somebody; this is the person who actually held the
 * money writing it down, at the door, with the Service User signing next to them. Typed up
 * later by somebody else it is a note about a transaction; typed here it IS the transaction.
 *
 * NO CHECK, NO DUE DATE, NO RAG. Shopping happens when it happens, so there is nothing for
 * this to be late for. It files Evidence against the carer's own record and nothing else --
 * a form that cannot be overdue must never make a company look non-compliant.
 *
 * Authorisation needs nothing new: submit_evidence already refuses anyone who is not a
 * member of the company, and the record it is filed against is the caller's OWN, looked up
 * from their profile rather than passed in from the browser. A carer cannot file a
 * transaction against somebody else by editing a form field, because no form field says who.
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";

const FORM_KEY = "financial_transaction";

/** Uploaded files arrive as file:<fieldKey> parts, the same convention as every other form. */
async function collectFiles(formData: FormData): Promise<EvidenceFileInput[]> {
  const files: EvidenceFileInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) {
      files.push({
        fieldKey: key.slice(5),
        kind: "upload",
        fileName: value.name,
        contentType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
  }
  return files;
}

export async function recordFinancialTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  /* THEIR OWN record, from their profile. Never from the form. */
  const { data: person } = await supabase
    .from("people")
    .select("id, branch_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!person) {
    return {
      error:
        "Your login is not linked to a record on the register yet, so there is nowhere to file this. Please tell your manager.",
    };
  }

  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("key", FORM_KEY)
    .maybeSingle();
  if (!form) return { error: "This form is not set up for your company. Please tell your manager." };

  const { data: version } = await supabase
    .from("form_versions")
    .select("id")
    .eq("form_id", form.id as string)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { error: "This form is not published, so it cannot be completed." };

  let answers: Answers = {};
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "That form could not be read. Please try again." };
  }

  const result = await submitEvidence({
    formVersionId: version.id as string,
    branchId: (person.branch_id as string | null) ?? null,
    answers,
    files: await collectFiles(formData),
    recordType: "person",
    recordId: person.id as string,
    evidenceId: randomUUID(),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/my");
  revalidatePath(`/people/${person.id as string}`);
  return { ok: "saved" };
}
