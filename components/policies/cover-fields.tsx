"use client";

/**
 * The cover page questions (ISO 9001, Phil 2026-10-06), shared by Write a policy and the draft
 * page so the two always ask the same thing. Title, company, version, dates, owner and the
 * change history are filled in by Be Care Compliant.
 */

import { APPLIES_TO, CLASSIFICATION, READ_BY, RETENTION, type CoverChoices } from "@/lib/policies/cover";

type Person = { id: string; full_name: string | null; role: string };

const ROLE_SHORT: Record<string, string> = {
  registered_individual: "Responsible Individual",
  registered_manager: "Registered Manager",
  company_admin: "Admin",
  manager: "Manager",
};

export default function CoverFields({ people, value }: { people: Person[]; value: CoverChoices }) {
  const ri = people.find((p) => p.role === "registered_individual")?.id ?? "";
  const approver = value.approver_id && people.some((p) => p.id === value.approver_id) ? value.approver_id : ri;
  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Cover page</p>
      <p className="form-hint">
        Every policy prints with a cover page for ISO 9001 document control: reference number, version, who approved it and
        when, the owner, the next review, and a change history. These are the parts only you can tell us.
      </p>
      <input type="hidden" name="cover_present" value="1" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="approver_id" className="form-label">Approved by</label>
          <select id="approver_id" name="approver_id" defaultValue={approver}>
            <option value="">Not set</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "Unnamed"}
                {ROLE_SHORT[p.role] ? `, ${ROLE_SHORT[p.role]}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="applies_to" className="form-label">Applies to</label>
          <select id="applies_to" name="applies_to" defaultValue={value.applies_to}>
            {APPLIES_TO.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="read_by" className="form-label">Read and sign</label>
          <select id="read_by" name="read_by" defaultValue={value.read_by}>
            {READ_BY.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="retention" className="form-label">Retention</label>
          <select id="retention" name="retention" defaultValue={value.retention}>
            {RETENTION.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="classification" className="form-label">Classification</label>
          <select id="classification" name="classification" defaultValue={value.classification}>
            {CLASSIFICATION.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
