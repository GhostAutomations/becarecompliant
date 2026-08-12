"use client";

/**
 * Be Care Compliant — the incident detail fields, shared by "Record an incident" and
 * the edit form on the record. ONE definition on purpose: if the two forms drift, a
 * field that can be set on creation and never edited (or the reverse) becomes a trap,
 * and the aggregate quietly under-counts whatever the second form forgot.
 *
 * The escalation blocks reveal on tick. Both are on the same record, because a
 * safeguarding referral IS an incident that was escalated.
 */

import { useState } from "react";
import { INCIDENT_CATEGORIES, type IncidentRecord } from "@/lib/incidents/types";

type PersonOption = { id: string; full_name: string; branch_id: string | null };

export default function IncidentFields({
  idPrefix,
  incident,
  serviceUsers,
  people,
  branchId,
  todayIso,
  onEdit,
}: {
  /** Prefix for element ids so create and edit can coexist on one page. */
  idPrefix: string;
  incident?: IncidentRecord;
  serviceUsers: PersonOption[];
  people: PersonOption[];
  /** Restrict the who-it-happened-to lists to one branch. Empty = no branch chosen yet. */
  branchId: string;
  todayIso: string;
  onEdit?: () => void;
}) {
  const [notifiable, setNotifiable] = useState(incident?.notifiable ?? false);
  const [safeguarding, setSafeguarding] = useState(incident?.safeguarding ?? false);

  const id = (name: string) => `${idPrefix}_${name}`;
  const visibleServiceUsers = branchId ? serviceUsers.filter((s) => s.branch_id === branchId) : serviceUsers;
  const visiblePeople = branchId ? people.filter((p) => p.branch_id === branchId) : people;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={id("occurred_on")} className="form-label">Date it happened *</label>
          <input
            id={id("occurred_on")}
            name="occurred_on"
            type="date"
            required
            max={todayIso}
            defaultValue={incident?.occurred_on ?? todayIso}
          />
        </div>

        <div>
          <label htmlFor={id("occurred_at")} className="form-label">Time</label>
          <input
            id={id("occurred_at")}
            name="occurred_at"
            type="time"
            defaultValue={incident?.occurred_at ? incident.occurred_at.slice(0, 5) : ""}
          />
          <p className="form-hint">Optional, but worth recording where it is known.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={id("category")} className="form-label">Category *</label>
          <select id={id("category")} name="category" required defaultValue={incident?.category ?? ""}>
            <option value="" disabled>Please choose</option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {/* A category recorded before this list changed must stay selectable. */}
            {incident && !(INCIDENT_CATEGORIES as readonly string[]).includes(incident.category) ? (
              <option value={incident.category}>{incident.category}</option>
            ) : null}
          </select>
        </div>

        <div>
          <label htmlFor={id("service_user_id")} className="form-label">Service user involved</label>
          <select id={id("service_user_id")} name="service_user_id" defaultValue={incident?.service_user_id ?? ""}>
            <option value="">No service user involved</option>
            {visibleServiceUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={id("person_id")} className="form-label">Staff member involved</label>
          <select id={id("person_id")} name="person_id" defaultValue={incident?.person_id ?? ""}>
            <option value="">No staff member involved</option>
            {visiblePeople.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
          <p className="form-hint">Either, both or neither — some incidents involve nobody in particular.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={id("description")} className="form-label">What happened *</label>
          <textarea
            id={id("description")}
            name="description"
            rows={4}
            required
            defaultValue={incident?.description ?? ""}
            placeholder="Facts only: what happened, where, and who was present."
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={id("immediate_action")} className="form-label">Immediate action taken</label>
          <textarea
            id={id("immediate_action")}
            name="immediate_action"
            rows={3}
            defaultValue={incident?.immediate_action ?? ""}
            placeholder="What was done at the time — first aid, GP called, family informed."
          />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 text-sm text-white/80">
          <input
            type="checkbox"
            name="notifiable"
            className="mt-0.5"
            defaultChecked={incident?.notifiable ?? false}
            onChange={(e) => { setNotifiable(e.target.checked); onEdit?.(); }}
          />
          <span>
            Notifiable to the regulator
            <span className="block text-xs text-white/50">
              CQC Regulation 18 in England, CIW Regulation 60 in Wales. Tick it now even if
              the notification has not gone yet — the register will chase it.
            </span>
          </span>
        </label>

        {notifiable ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={id("notified_on")} className="form-label">Date notified</label>
              <input
                id={id("notified_on")}
                name="notified_on"
                type="date"
                defaultValue={incident?.notified_on ?? ""}
              />
              <p className="form-hint">Leave blank until it has actually been sent.</p>
            </div>
            <div>
              <label htmlFor={id("regulator_reference")} className="form-label">Regulator reference</label>
              <input
                id={id("regulator_reference")}
                name="regulator_reference"
                defaultValue={incident?.regulator_reference ?? ""}
                placeholder="Reference from the notification"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 p-4">
        <label className="flex items-start gap-3 text-sm text-white/80">
          <input
            type="checkbox"
            name="safeguarding"
            className="mt-0.5"
            defaultChecked={incident?.safeguarding ?? false}
            onChange={(e) => { setSafeguarding(e.target.checked); onEdit?.(); }}
          />
          <span>
            Raised as a safeguarding matter
            <span className="block text-xs text-white/50">
              Kept on this record rather than as a separate one, so the incident and the
              referral always tell the same story.
            </span>
          </span>
        </label>

        {safeguarding ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={id("safeguarding_referred_on")} className="form-label">Date referred</label>
              <input
                id={id("safeguarding_referred_on")}
                name="safeguarding_referred_on"
                type="date"
                defaultValue={incident?.safeguarding_referred_on ?? ""}
              />
            </div>
            <div>
              <label htmlFor={id("local_authority")} className="form-label">Local authority</label>
              <input
                id={id("local_authority")}
                name="local_authority"
                defaultValue={incident?.local_authority ?? ""}
                placeholder="Who the referral went to"
              />
            </div>
            <div>
              <label htmlFor={id("local_authority_reference")} className="form-label">
                Local authority reference
              </label>
              <input
                id={id("local_authority_reference")}
                name="local_authority_reference"
                defaultValue={incident?.local_authority_reference ?? ""}
              />
            </div>
            <div>
              <label htmlFor={id("safeguarding_outcome")} className="form-label">Outcome</label>
              <input
                id={id("safeguarding_outcome")}
                name="safeguarding_outcome"
                defaultValue={incident?.safeguarding_outcome ?? ""}
                placeholder="e.g. No further action, Section 42 enquiry"
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
