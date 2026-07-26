"use client";

/**
 * Be Care Compliant — the PUBLIC form a team member fills in with no login.
 *
 * Two identity boxes come first (full name and the personal email their employer
 * holds), then the company's own form, rendered by the shared FormRenderer so a
 * public page can never drift from the in-app one. There is a hidden honeypot
 * field for bots. Nothing is ever read back: on success the form is replaced by
 * a fixed thank you, the same message whether or not the email matched a record.
 */

import { useActionState, useState } from "react";
import type { Answers, FormSchema } from "@/lib/form-schema";
import FormRenderer from "@/components/forms/form-renderer";
import { submitPublicForm } from "@/lib/public-forms/submit";
import type { PublicSubmitState } from "@/lib/public-forms/types";

const IDLE: PublicSubmitState = {};

export default function PublicForm({
  linkCode,
  formKey,
  schema,
  intro,
}: {
  linkCode: string;
  formKey: string;
  schema: FormSchema;
  intro: string;
}) {
  const [state, action, pending] = useActionState(submitPublicForm, IDLE);
  const [answers, setAnswers] = useState<Answers>({});

  if (state.ok) {
    return (
      <div className="glass-card p-6">
        <p className="text-base font-semibold text-white">Sent</p>
        <p className="mt-2 text-sm text-white/70">{state.ok}</p>
        <p className="mt-4 text-xs text-white/40">You can close this page.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="link_code" value={linkCode} />
      <input type="hidden" name="form_key" value={formKey} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="hidden">
        <label htmlFor="company_website">Company website</label>
        <input id="company_website" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-sm text-white/70">{intro}</p>

      <div className="glass-card space-y-5 p-5">
        <div>
          <label htmlFor="identity_name" className="form-label">Your full name *</label>
          <input id="identity_name" name="identity_name" required autoComplete="name" disabled={pending} />
        </div>
        <div>
          <label htmlFor="identity_email" className="form-label">Your personal email *</label>
          <input
            id="identity_email"
            name="identity_email"
            type="email"
            required
            autoComplete="email"
            disabled={pending}
          />
          <p className="form-hint">
            Use the email address your employer holds for you, so this reaches your record.
          </p>
        </div>
      </div>

      <div className="glass-card p-5">
        <FormRenderer
          schema={schema}
          idPrefix="pf"
          disabled={pending}
          errors={state.errors}
          onChange={setAnswers}
        />
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" className="btn-primary px-5 py-2.5 text-sm" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
