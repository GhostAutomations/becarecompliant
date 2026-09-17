"use client";

/**
 * Be Care Compliant — which team members a complaint is about.
 *
 * Phil, 2026-09-15: "if it is about a team member, we need to be able to select that staff
 * member". Several, not one: a badly handled visit can involve two carers, and forcing a choice
 * means the second is never recorded.
 *
 * TYPE THE NAME (Phil, 2026-09-17): "i dont like the Team members this is about, lets have that
 * box where we type the carers name and they appear, we built a field like the previosly". It was
 * a scrolling list of tick boxes, which is fine at thirteen carers and unusable at two hundred:
 * the manager already knows the name, and a list makes them hunt for it. It now uses
 * RecordTypeahead, the same control and the same matching rule as the record lookup on a Spot
 * Check form, so "obrien" finds O'Brien in both places.
 *
 * EVERY CARER IN THE COMPANY, not the complaint's branch (Phil, 2026-09-17): "i dont want it to
 * be branch specific because it could be that a people from another branch is working in another
 * area, thats why i want this search as apposed tp a drop down that relates to a branch". Cover
 * shifts cross branches, and a complaint naming nobody because the carer who was there is
 * registered in Newport is a complaint that loses the one fact it was logged for. The branch is
 * shown beside each name instead, where it tells two carers with the same name apart rather than
 * deciding who may be named.
 *
 * Each pick becomes a chip with the id beside it, so more than one carer can be named and any one
 * of them removed without disturbing the others.
 */

import { useMemo, useState } from "react";
import RecordTypeahead from "@/components/register/record-typeahead";
import type { LookupChoice } from "@/lib/forms/lookup";

export type PersonOption = { id: string; full_name: string; branch_name: string | null };

export default function ComplaintPeoplePicker({
  people,
  initialIds = [],
}: {
  people: PersonOption[];
  initialIds?: string[];
}) {
  const [chosenIds, setChosenIds] = useState<string[]>(() =>
    initialIds.filter((id) => people.some((p) => p.id === id)),
  );
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  /* Anyone already named leaves the suggestions: a name that is already a chip is not a choice,
     and leaving it there invites a second click that does nothing. */
  const choices: LookupChoice[] = useMemo(
    () =>
      people
        .filter((p) => !chosenIds.includes(p.id))
        .map((p) => ({ id: p.id, label: p.full_name, hint: p.branch_name ?? undefined })),
    [people, chosenIds],
  );

  const chosen = chosenIds.map((id) => byId.get(id)).filter((p): p is PersonOption => !!p);

  return (
    <div>
      <label htmlFor="complaint_person_search" className="form-label">
        Team members this is about
      </label>

      {chosen.length > 0 ? (
        <ul className="mb-2 mt-1 flex flex-wrap gap-2">
          {chosen.map((p) => (
            <li key={p.id}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/85">
                <span>{p.full_name}</span>
                {p.branch_name ? <span className="text-xs text-white/40">{p.branch_name}</span> : null}
                <button
                  type="button"
                  onClick={() => setChosenIds((prev) => prev.filter((id) => id !== p.id))}
                  aria-label={`Remove ${p.full_name}`}
                  className="text-white/50 hover:text-white"
                >
                  ×
                </button>
              </span>
              {/* The value the form posts. One hidden input per chip, so removing a chip removes
                  exactly one name and never renumbers the rest. */}
              <input type="hidden" name="person_ids" value={p.id} />
            </li>
          ))}
        </ul>
      ) : null}

      <RecordTypeahead
        id="complaint_person_search"
        query={query}
        choices={choices}
        onQueryChange={setQuery}
        onChoose={(choice) => {
          setChosenIds((prev) => (prev.includes(choice.id) ? prev : [...prev, choice.id]));
          setQuery("");
        }}
        noMatchText="Nobody on the team matches that name."
      />

      <p className="form-hint">
        Optional, and more than one can be named, from any branch. A complaint shows on a team
        member&apos;s record alongside whether it was upheld, never as a bare count.
      </p>
    </div>
  );
}
