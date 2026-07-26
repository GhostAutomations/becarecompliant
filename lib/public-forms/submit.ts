"use server";

/**
 * Be Care Compliant — the PUBLIC form submit path.
 *
 * No session exists here, so this is the one place that writes on behalf of a
 * person with no account. Everything it can do is deliberately narrow:
 *
 *   - it only accepts a form key from the publishable catalogue,
 *   - the company's link for that form must exist and be switched on,
 *   - the answers are validated server side against the stored schema, exactly
 *     as an in-app submission is (never trust the client),
 *   - the write itself happens inside submit_public_form, a SECURITY DEFINER
 *     function with a pinned search_path that anon cannot execute (service role
 *     only), and it re-checks the link before writing anything,
 *   - it is rate limited and honeypotted, and it NEVER reads anything back to
 *     the page: the response is a fixed thank you whether or not the email
 *     matched a Person, so the page cannot be used to test who works here.
 *
 * GDPR: this is public intake of personal data, so the submission is validated,
 * rate limited and audited, and an unmatched one is held in a queue rather than
 * guessed at.
 */

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { isBinaryField, type Answers, type FormSchema } from "@/lib/form-schema";
import { cleanAnswers, validateAnswers } from "@/lib/form-validate";
import { publicFormDef } from "@/lib/public-forms/config";
import { PUBLIC_FORMS_ENABLED } from "@/lib/public-forms/flag";
import { resolvePublicForm } from "@/lib/public-forms/data";
import { notifyHolidayRequested } from "@/lib/notifications/holiday";
import type { PublicSubmitState } from "@/lib/public-forms/types";

const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 10;

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * Seed the identity boxes into any matching schema field the person left blank,
 * so the stored Evidence reads naturally (a Name field says their name, an email
 * field holds their email). Presets only: the schema itself is never rewritten,
 * so the client and the server validate exactly the same stored form.
 */
function seedIdentityAnswers(
  schema: FormSchema,
  answers: Answers,
  identity: { fullName: string; email: string },
): Answers {
  const seeded: Answers = { ...answers };
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const key = (field.key ?? "").toLowerCase();
      const label = (field.label ?? "").toLowerCase();
      const current = seeded[field.key];
      const isBlank = current === undefined || current === null || current === "";
      if (!isBlank) continue;
      // Only ever seed a free-text style question, never a date, a choice or a
      // rating: those stay exactly as the person answered them.
      if (field.type !== "short_text" && field.type !== "long_text" && field.type !== "email") {
        continue;
      }

      if (key.includes("email") || label.includes("email")) {
        seeded[field.key] = identity.email;
        continue;
      }
      if (key === "name" || key === "full_name" || key === "your_name" || label === "name") {
        seeded[field.key] = identity.fullName;
      }
    }
  }
  return seeded;
}

/** Drop any answer for a field type the public page cannot support. */
function stripUnsupported(schema: FormSchema, answers: Answers): Answers {
  const out: Answers = { ...answers };
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (isBinaryField(field.type)) delete out[field.key];
    }
  }
  return out;
}

export async function submitPublicForm(
  _prev: PublicSubmitState,
  formData: FormData,
): Promise<PublicSubmitState> {
  const code = String(formData.get("link_code") ?? "");
  const formKey = String(formData.get("form_key") ?? "");
  const fullName = String(formData.get("identity_name") ?? "").trim();
  const email = String(formData.get("identity_email") ?? "").trim();
  const honeypot = String(formData.get("company_website") ?? "").trim();

  if (!PUBLIC_FORMS_ENABLED) return { error: "This form is not available." };

  const def = publicFormDef(formKey);
  if (!def) return { error: "This form is not available." };

  // Honeypot: a real person never fills a field they cannot see. Answer exactly
  // as a success so a bot learns nothing, but write nothing.
  if (honeypot) return { ok: def.publicThanks };

  if (!fullName) return { error: "Enter your full name." };
  if (!email || !looksLikeEmail(email)) {
    return { error: "Enter the personal email your employer holds for you." };
  }

  const resolved = await resolvePublicForm(code);
  if (!resolved || resolved.formKey !== formKey) {
    return { error: "This form is not currently accepting submissions." };
  }

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read your answers. Please try again." };
  }

  const supabase = createServiceClient();

  // Rate limit per caller per form. The key is a hash, so no IP is ever stored.
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rateKey = createHash("sha256")
    .update(`${ip}:${resolved.companyId}:${formKey}`)
    .digest("hex");
  const { data: allowed, error: rateError } = await supabase.rpc("public_form_rate_ok", {
    p_key: rateKey,
    p_limit: RATE_LIMIT,
    p_window_minutes: RATE_WINDOW_MINUTES,
  });
  if (rateError) return { error: "Could not send your form just now. Please try again." };
  if (allowed === false) {
    return {
      error:
        "You have sent several forms in a short time. Please wait a few minutes and try again.",
    };
  }

  const withIdentity = seedIdentityAnswers(resolved.schema, answers, { fullName, email });
  const supported = stripUnsupported(resolved.schema, withIdentity);

  const validation = validateAnswers(resolved.schema, supported);
  if (!validation.ok) {
    return { error: "Please correct the highlighted questions.", errors: validation.errors };
  }
  const cleaned = cleanAnswers(resolved.schema, supported);

  const startDate = isoOrNull(cleaned["start_date_of_holiday"]);
  const endDate = isoOrNull(cleaned["end_date_of_holiday"]);
  if (formKey === "holiday_requests" && (!startDate || !endDate)) {
    return { error: "Enter the start and end dates of your holiday." };
  }

  const { data: result, error } = await supabase.rpc("submit_public_form", {
    p_company_id: resolved.companyId,
    p_form_key: formKey,
    p_form_version_id: resolved.formVersionId,
    p_answers: cleaned,
    p_email: email,
    p_name: fullName,
    p_start_date: startDate,
    p_end_date: endDate,
    p_note: typeof cleaned["note"] === "string" ? (cleaned["note"] as string) : null,
  });
  if (error) return { error: "Your form could not be sent. Please tell your manager." };

  const outcome = (result ?? {}) as {
    submission_id?: string;
    status?: string;
    branch_id?: string | null;
    holiday_request_id?: string | null;
    person_name?: string | null;
  };

  // A confident match behaves exactly like an in-app request: the approvers are
  // emailed straight away. An unmatched one waits in the queue instead, so no
  // approver is chased about a request nobody can attribute yet.
  if (outcome.holiday_request_id && startDate && endDate) {
    await notifyHolidayRequested({
      companyId: resolved.companyId,
      branchId: outcome.branch_id ?? null,
      requestId: outcome.holiday_request_id,
      requesterName: outcome.person_name ?? fullName,
      startDate,
      endDate,
    });
  }

  await writeAudit({
    companyId: resolved.companyId,
    actorId: null,
    actorEmail: email,
    actorRole: "public",
    action: "public_form.submitted",
    entityType: "public_form_submission",
    entityId: outcome.submission_id ?? null,
    summary: `Public ${def.label} submission (${outcome.status ?? "received"})`,
    metadata: { form_key: formKey, status: outcome.status ?? null },
  });

  // The same answer either way: the page must never reveal whether the email is
  // known to this company.
  return { ok: def.publicThanks };
}
