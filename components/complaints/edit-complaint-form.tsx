"use client";

import { useActionState } from "react";
import { updateComplaint } from "@/lib/complaints/actions";
import { IDLE_STATE } from "@/lib/forms";
import {
  RELATIONSHIP_LABELS,
  CONCERN_TYPES,
  FORMALITY_TYPES,
  CONTACT_METHODS,
  type ComplaintRecord,
  type ComplaintRelationship,
} from "@/lib/complaints/types";

export default function EditComplaintForm({
  complaint,
  serviceUsers,
}: {
  complaint: ComplaintRecord;
  serviceUsers: Array<{ id: string; full_name: string }>;
}) {
  const [state, formAction, pending] = useActionState(updateComplaint, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="complaint_id" value={complaint.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e_subject" className="form-label">Subject</label>
          <input id="e_subject" name="subject" defaultValue={complaint.subject} required />
        </div>
        <div>
          <label htmlFor="e_complainant_name" className="form-label">Complainant name</label>
          <input id="e_complainant_name" name="complainant_name" defaultValue={complaint.complainant_name ?? ""} />
        </div>
        <div>
          <label htmlFor="e_relationship" className="form-label">Complainant is a</label>
          <select id="e_relationship" name="complainant_relationship" defaultValue={complaint.complainant_relationship ?? ""}>
            <option value="">Not stated</option>
            {(Object.keys(RELATIONSHIP_LABELS) as ComplaintRelationship[]).map((k) => (
              <option key={k} value={k}>{RELATIONSHIP_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e_service_user" className="form-label">Related service user</label>
          <select id="e_service_user" name="service_user_id" defaultValue={complaint.service_user_id ?? ""}>
            <option value="">None</option>
            {serviceUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e_concern_type" className="form-label">Complaint/Concern</label>
          <select id="e_concern_type" name="concern_type" defaultValue={complaint.concern_type ?? ""}>
            <option value="">Not set</option>
            {CONCERN_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e_formality" className="form-label">Type</label>
          <select id="e_formality" name="formality" defaultValue={complaint.formality ?? ""}>
            <option value="">Not set</option>
            {FORMALITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e_contact_method" className="form-label">Preferred contact method</label>
          <select id="e_contact_method" name="contact_method" defaultValue={complaint.contact_method ?? ""}>
            <option value="">Not stated</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e_contact_email" className="form-label">Contact email</label>
          <input id="e_contact_email" name="contact_email" type="email" defaultValue={complaint.contact_email ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="e_contact_address" className="form-label">Contact address</label>
          <textarea id="e_contact_address" name="contact_address" rows={2} defaultValue={complaint.contact_address ?? ""} />
        </div>
        <div>
          <label htmlFor="e_date_occurred" className="form-label">Date it happened</label>
          <input id="e_date_occurred" name="date_occurred" type="date" defaultValue={complaint.date_occurred ?? ""} />
        </div>
        <div>
          <label htmlFor="e_date_acknowledged" className="form-label">Initial response sent</label>
          <input id="e_date_acknowledged" name="date_acknowledged" type="date" defaultValue={complaint.date_acknowledged ?? ""} />
        </div>
        <div>
          <label htmlFor="e_ack_due" className="form-label">Initial response due</label>
          <input id="e_ack_due" name="acknowledgement_due" type="date" defaultValue={complaint.acknowledgement_due ?? ""} />
        </div>
        <div>
          <label htmlFor="e_investigation" className="form-label">Investigation completed</label>
          <input id="e_investigation" name="investigation_completed" type="date" defaultValue={complaint.investigation_completed ?? ""} />
        </div>
        <div>
          <label htmlFor="e_response_due" className="form-label">Response due</label>
          <input id="e_response_due" name="response_due" type="date" defaultValue={complaint.response_due ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="e_details" className="form-label">Details</label>
          <textarea id="e_details" name="details" rows={4} defaultValue={complaint.details ?? ""} />
        </div>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending} className={`btn ${state.ok ? "btn-saved" : "btn-primary"}`}>
        {pending ? "Saving…" : state.ok ? "Saved" : "Save changes"}
      </button>
    </form>
  );
}
