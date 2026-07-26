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

import { useMemo, useState } from "react";
import ActionForm from "@/components/action-form";
import { assignItems } from "@/lib/assignments/actions";
import type { BriefingPerson, BriefingScope, CompanyPolicy } from "@/lib/assignments/types";

function plural(n: number): string {
  return n === 1 ? "person" : "people";
}

export default function AssignPanel({
  forms,
  policies,
  people,
}: {
  forms: Array<{ id: string; name: string }>;
  policies: CompanyPolicy[];
  people: BriefingPerson[];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<BriefingScope>("company");
  const [branchId, setBranchId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) {
      if (p.branch_id) map.set(p.branch_id, p.branch_name ?? "Branch");
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name, count: people.filter((p) => p.branch_id === id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const noBranch = people.filter((p) => !p.branch_id).length;
  const inBranch = branchId ? people.filter((p) => p.branch_id === branchId) : [];
  const branchCount = inBranch.length;
  const allPicked = people.length > 0 && picked.length === people.length;

  // Who will actually get an email. Everyone else only sees it when they log in,
  // which a Manager needs to know BEFORE they send, not afterwards.
  const emailable = (list: BriefingPerson[]) => list.filter((p) => p.has_email).length;
  function silentNote(list: BriefingPerson[]): string {
    const silent = list.length - emailable(list);
    if (silent === 0) return " Everyone will get an email.";
    return ` ${emailable(list)} will get an email. ${silent} ${
      silent === 1 ? "has" : "have"
    } no email address, so they will only see it when they log in.`;
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setOpen(true)}>
        Send a briefing
      </button>
    );
  }

  const scopeOptions: Array<{ value: BriefingScope; label: string; hint: string }> = [
    {
      value: "company",
      label: "Everyone",
      hint: `All ${people.length} ${plural(people.length)} on the register`,
    },
    {
      value: "branch",
      label: "A whole branch",
      hint: branches.length > 0 ? "Pick the branch" : "No branches set up yet",
    },
    { value: "people", label: "Chosen people", hint: "Tick them yourself" },
  ];

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Send a briefing</h2>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <ActionForm action={assignItems} label="Send" savedLabel="Sent">
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
          <span className="form-label">Who is it for? *</span>

          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {scopeOptions.map((o) => {
              const active = scope === o.value;
              const disabled = o.value === "branch" && branches.length === 0;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setScope(o.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-amber-400/60 bg-amber-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <span className="block text-sm font-semibold text-white">{o.label}</span>
                  <span className="block text-xs text-white/50">{o.hint}</span>
                </button>
              );
            })}
          </div>

          {scope === "company" && (
            <p className="form-hint">
              Goes to all {people.length} {plural(people.length)} on your register. Leavers and
              archived records are never included.
              {noBranch > 0 ? ` That includes ${noBranch} with no branch set.` : ""}
              {silentNote(people)}
            </p>
          )}

          {scope === "branch" && (
            <div className="mt-3">
              <label htmlFor="assign-branch" className="form-label">
                Which branch? *
              </label>
              <select
                id="assign-branch"
                name="branch_id"
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="" disabled>
                  Please choose
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
              <p className="form-hint">
                {branchId
                  ? `Goes to all ${branchCount} ${plural(branchCount)} in that branch.${silentNote(inBranch)}`
                  : "Useful when one local authority asks for a document the others do not."}
              </p>
            </div>
          )}

          {scope === "people" && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() => setPicked(allPicked ? [] : people.map((p) => p.id))}
                >
                  {allPicked ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3">
                {people.length === 0 ? (
                  <p className="text-sm text-white/50">Nobody on the register yet.</p>
                ) : (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {people.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 text-sm text-white/85">
                          <input
                            type="checkbox"
                            name="person_ids"
                            value={p.id}
                            checked={picked.includes(p.id)}
                            onChange={() => toggle(p.id)}
                          />
                          {p.full_name}
                          {p.branch_name ? (
                            <span className="text-xs text-white/40">{p.branch_name}</span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="form-hint">
                {picked.length} selected. Anyone who already has this open is skipped.
                {picked.length > 0
                  ? silentNote(people.filter((p) => picked.includes(p.id)))
                  : ""}
              </p>
            </div>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
