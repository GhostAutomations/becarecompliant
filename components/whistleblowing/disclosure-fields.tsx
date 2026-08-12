"use client";

/**
 * Be Care Compliant — the disclosure fields, shared by "Record a disclosure" and the edit
 * form on the record, so the two cannot drift.
 */

import { useState } from "react";
import { DISCLOSURE_CATEGORIES, type DisclosureRecord } from "@/lib/whistleblowing/types";

export default function DisclosureFields({
  idPrefix,
  record,
  branches,
  todayIso,
  onEdit,
}: {
  idPrefix: string;
  record?: DisclosureRecord;
  branches: Array<{ id: string; name: string }>;
  todayIso: string;
  onEdit?: () => void;
}) {
  const [named, setNamed] = useState(record ? !record.anonymous : false);
  const id = (name: string) => `${idPrefix}_${name}`;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={id("received_on")} className="form-label">Date received *</label>
          <input
            id={id("received_on")}
            name="received_on"
            type="date"
            required
            max={todayIso}
            defaultValue={record?.received_on ?? todayIso}
          />
        </div>

        <div>
          <label htmlFor={id("branch_id")} className="form-label">Branch</label>
          <select id={id("branch_id")} name="branch_id" defaultValue={record?.branch_id ?? ""}>
            <option value="">Company wide / not branch specific</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <p className="form-hint">
            Leave this blank unless the disclosure is clearly about one branch. On a small
            branch, naming it can point at who made the disclosure.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={id("category")} className="form-label">Category *</label>
          <select id={id("category")} name="category" required defaultValue={record?.category ?? ""}>
            <option value="" disabled>Please choose</option>
            {DISCLOSURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {record && !(DISCLOSURE_CATEGORIES as readonly string[]).includes(record.category) ? (
              <option value={record.category}>{record.category}</option>
            ) : null}
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 text-sm text-white/80">
          <input
            type="checkbox"
            name="named"
            className="mt-0.5"
            defaultChecked={record ? !record.anonymous : false}
            onChange={(e) => { setNamed(e.target.checked); onEdit?.(); }}
          />
          <span>
            The discloser gave their name
            <span className="block text-xs text-white/50">
              Leave this unticked unless they did. Untick it later and the name is deleted, not
              hidden — there is then no name to leak in an export or a backup.
            </span>
          </span>
        </label>

        {named ? (
          <div>
            <label htmlFor={id("discloser_name")} className="form-label">Discloser name</label>
            <input
              id={id("discloser_name")}
              name="discloser_name"
              defaultValue={record?.discloser_name ?? ""}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor={id("disclosure")} className="form-label">What was disclosed *</label>
          <textarea
            id={id("disclosure")}
            name="disclosure"
            rows={5}
            required
            defaultValue={record?.disclosure ?? ""}
            placeholder="In their words as far as possible. Facts, dates and who was said to be involved."
          />
        </div>

        <div>
          <label htmlFor={id("action_taken")} className="form-label">Action taken</label>
          <textarea
            id={id("action_taken")}
            name="action_taken"
            rows={3}
            defaultValue={record?.action_taken ?? ""}
            placeholder="What was done — who investigated, who was told, whether it was referred on."
          />
        </div>
      </div>
    </>
  );
}
