"use client";

/**
 * Be Care Compliant — "Who is it for?" on a Briefing: Everyone, a whole branch, or chosen people.
 *
 * Phil, 2026-07-26: "i can select the whole company or i can select a whole branch as depending
 * on the local authourity, they may need to issue different docs per branch". Shared by sending a
 * policy or a form and by sending a memo, message or attachment, so the two always offer the same
 * choice. It is only a CHOICE here: the server resolves Everyone and a branch from the register
 * (lib/assignments/audience.ts), so the browser cannot widen the audience.
 *
 * Controlled: the parent holds scope, branch and the ticked people. The branch select and the
 * person checkboxes also carry form names, so a plain form post sees them too.
 */

import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { BriefingPerson, BriefingScope } from "@/lib/assignments/types";
import { useBranchWord } from "@/components/branches/branch-word";

function plural(n: number): string {
  return n === 1 ? "person" : "people";
}

export default function AudiencePicker({
  people,
  scope,
  setScope,
  branchId,
  setBranchId,
  picked,
  setPicked,
  idPrefix = "assign",
  skipNote = true,
}: {
  people: BriefingPerson[];
  scope: BriefingScope;
  setScope: (s: BriefingScope) => void;
  branchId: string;
  setBranchId: (id: string) => void;
  picked: string[];
  setPicked: Dispatch<SetStateAction<string[]>>;
  idPrefix?: string;
  /** Say that people who already have it open are skipped (policies and forms only). */
  skipNote?: boolean;
}) {
  const bw = useBranchWord();
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

  const scopeOptions: Array<{ value: BriefingScope; label: string; hint: string }> = [
    {
      value: "company",
      label: "Everyone",
      hint: `All ${people.length} ${plural(people.length)} on the register`,
    },
    {
      value: "branch",
      label: `A whole ${bw.oneLower}`,
      hint: branches.length > 0 ? `Pick the ${bw.oneLower}` : `No ${bw.manyLower} set up yet`,
    },
    { value: "people", label: "Chosen people", hint: "Tick them yourself" },
  ];

  return (
        <div>
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
              {noBranch > 0 ? ` That includes ${noBranch} with no ${bw.oneLower} set.` : ""}
              {silentNote(people)}
            </p>
          )}

          {scope === "branch" && (
            <div className="mt-3">
              <label htmlFor={`${idPrefix}-branch`} className="form-label">
                Which {bw.oneLower}? *
              </label>
              <select
                id={`${idPrefix}-branch`}
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
                  ? `Goes to all ${branchCount} ${plural(branchCount)} in that ${bw.oneLower}.${silentNote(inBranch)}`
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
                {picked.length} selected.{skipNote ? " Anyone who already has this open is skipped." : ""}
                {picked.length > 0
                  ? silentNote(people.filter((p) => picked.includes(p.id)))
                  : ""}
              </p>
            </div>
          )}
        </div>
  );
}
