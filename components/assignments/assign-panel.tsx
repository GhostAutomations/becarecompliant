"use client";

/**
 * Be Care Compliant — send a briefing (a policy to sign, or a form to complete).
 *
 * Phil, 2026-07-26: "there also needs to be a select all option for who is it
 * for, so i can select the whole company or i can select a whole branch as
 * depending on the local authourity, they may need to issue different docs per
 * branch". So the audience is a decision of its own, made first and out loud:
 *
 *   Everyone   — the whole register
 *   One branch — because Cardiff and an English LA can want different documents
 *   Chosen people — the exception case, ticked by hand
 *
 * Everyone and One branch are only a CHOICE here; the server resolves them from
 * the register, so the browser cannot widen the audience and RLS still applies (a
 * Branch Manager's "everyone" is their own branch).
 *
 * Sending the same thing to somebody who already has it open is skipped rather
 * than duplicated, so it is safe to re-send after new starters join.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import AudiencePicker from "@/components/briefings/audience-picker";
import { assignItems } from "@/lib/assignments/actions";
import type { BriefingPerson, BriefingScope, CompanyPolicy } from "@/lib/assignments/types";

export default function AssignPanel({
  forms,
  policies,
  people,
  onClose,
}: {
  forms: Array<{ id: string; name: string }>;
  policies: CompanyPolicy[];
  people: BriefingPerson[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState<BriefingScope>("company");
  const [branchId, setBranchId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Send a policy or a form</h2>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <ActionForm
        action={assignItems}
        label="Send"
        savingLabel="Sending…"
        savedLabel="Sent"
        onDone={() => {
          setPicked([]);
          onClose();
        }}
      >
        <input type="hidden" name="scope" value={scope} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="assign-target" className="form-label">
              What are you sending? *
            </label>
            <select id="assign-target" name="target" required defaultValue="">
              <option value="" disabled>
                Please choose
              </option>
              {policies.length > 0 && (
                <optgroup label="Policies">
                  {policies.map((p) => (
                    <option key={p.id} value={`policy:${p.id}`}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {forms.length > 0 && (
                <optgroup label="Forms">
                  {forms.map((f) => (
                    <option key={f.id} value={`form:${f.id}`}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="assign-due" className="form-label">
              Due by (optional)
            </label>
            <input id="assign-due" name="due_date" type="date" />
          </div>
        </div>

        <div className="mt-4">
          <AudiencePicker
            people={people}
            scope={scope}
            setScope={setScope}
            branchId={branchId}
            setBranchId={setBranchId}
            picked={picked}
            setPicked={setPicked}
          />
        </div>
      </ActionForm>
    </div>
  );
}
