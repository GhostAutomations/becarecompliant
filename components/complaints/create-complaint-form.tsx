"use client";

import { useActionState, useState } from "react";
import { createComplaint } from "@/lib/complaints/actions";
import { IDLE_STATE } from "@/lib/forms";
import {
  RELATIONSHIP_LABELS,
  CONCERN_TYPES,
  FORMALITY_TYPES,
  CONTACT_METHODS,
  type ComplaintRelationship,
} from "@/lib/complaints/types";

export default function CreateComplaintForm({
  branches,
  serviceUsers,
  todayIso,
}: {
  branches: Array<{ id: string; name: string }>;
  serviceUsers: Array<{ id: string; full_name: string }>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(createComplaint, IDLE_STATE);
  const [contactMethod, setContactMethod] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="subject" className="form-label">Subject *</label>
          <input id="subject" name="subject" required placeholder="Short summary of the complaint" />
        </div>

        <div>
          <label htmlFor="branch_id" className="form-label">Branch *</label>
          <select id="branch_id" name="branch_id" required defaultValue="">
            <option value="" disabled>Please choose</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date_raised" className="form-label">Date raised</label>
          <input id="date_raised" name="date_raised" type="date" defaultValue={todayIso} />
          <p className="form-hint">The acknowledgement and response deadlines are set from this date.</p>
        </div>

        <div>
          <label htmlFor="complainant_name" className="form-label">Complainant name</label>
          <input id="complainant_name" name="complainant_name" placeholder="Leave blank if anonymous" />
        </div>

        <div>
          <label htmlFor="complainant_relationship" className="form-label">Complainant is a</label>
          <select id="complainant_relationship" name="complainant_relationship" defaultValue="">
            <option value="">Not stated</option>
            {(Object.keys(RELATIONSHIP_LABELS) as ComplaintRelationship[]).map((k) => (
              <option key={k} value={k}>{RELATIONSHIP_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date_occurred" className="form-label">Date it happened</label>
          <input id="date_occurred" name="date_occurred" type="date" />
        </div>

        <div>
          <label htmlFor="concern_type" className="form-label">Complaint/Concern</label>
          <select id="concern_type" name="concern_type" defaultValue="">
            <option value="">Please choose</option>
            {CONCERN_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="formality" className="form-label">Type</label>
          <select id="formality" name="formality" defaultValue="">
            <option value="">Please choose</option>
            {FORMALITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="contact_method" className="form-label">Preferred contact method</label>
          <select
            id="contact_method"
            name="contact_method"
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value)}
          >
            <option value="">Not stated</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {contactMethod === "email" ? (
          <div>
            <label htmlFor="contact_email" className="form-label">Contact email</label>
            <input id="contact_email" name="contact_email" type="email" placeholder="name@example.com" />
          </div>
        ) : null}

        {contactMethod === "post" ? (
          <div className="sm:col-span-2">
            <label htmlFor="contact_address" className="form-label">Contact address</label>
            <textarea id="contact_address" name="contact_address" rows={3} placeholder="Postal address for the response" />
          </div>
        ) : null}

        <div>
          <label htmlFor="service_user_id" className="form-label">Related service user</label>
          <select id="service_user_id" name="service_user_id" defaultValue="">
            <option value="">Not about a specific service user</option>
            {serviceUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
          <p className="form-hint">Optional. Link the complaint to a service user if it is about their care.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="details" className="form-label">Details</label>
          <textarea id="details" name="details" rows={4} placeholder="What is the complaint about?" />
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Logging…" : "Log complaint"}
        </button>
      </div>
    </form>
  );
}
