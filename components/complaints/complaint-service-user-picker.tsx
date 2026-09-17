"use client";

/**
 * Be Care Compliant — which service user a complaint relates to.
 *
 * Phil, 2026-09-17: "same for Related service user". It was a branch narrowed dropdown, which
 * assumes the complaint and the service user sit in the same branch. They need not: a package can
 * be covered from another area, and a dropdown that has quietly filtered somebody out looks
 * exactly like a service user who is not on the system. A search cannot hide anybody.
 *
 * The branch is not gone, it has changed job: it sits beside each name to tell two service users
 * with the same name apart, rather than deciding which of them may be chosen.
 *
 * ONE service user, unlike the team member picker beside it, because a complaint is about one
 * package. Chosen, it becomes a chip; cleared, the search comes back. The hidden input is always
 * posted, so clearing it on the edit form actually unsets the link rather than leaving the old
 * one in place.
 *
 * Same control and same matching rule as the record lookup on a Spot Check form, so a name typed
 * here finds what that name finds everywhere else.
 */

import { useMemo, useState } from "react";
import RecordTypeahead from "@/components/register/record-typeahead";
import type { LookupChoice } from "@/lib/forms/lookup";

export type ServiceUserOption = { id: string; full_name: string; branch_name: string | null };

export default function ComplaintServiceUserPicker({
  serviceUsers,
  initialId = null,
  fieldId = "service_user_id",
}: {
  serviceUsers: ServiceUserOption[];
  initialId?: string | null;
  fieldId?: string;
}) {
  const [chosenId, setChosenId] = useState<string | null>(
    initialId && serviceUsers.some((s) => s.id === initialId) ? initialId : null,
  );
  const [query, setQuery] = useState("");

  const chosen = useMemo(
    () => serviceUsers.find((s) => s.id === chosenId) ?? null,
    [serviceUsers, chosenId],
  );
  const choices: LookupChoice[] = useMemo(
    () => serviceUsers.map((s) => ({ id: s.id, label: s.full_name, hint: s.branch_name ?? undefined })),
    [serviceUsers],
  );

  return (
    <div>
      <label htmlFor={fieldId} className="form-label">
        Related service user
      </label>

      {/* Always posted, empty when nobody is chosen, so clearing the field unsets the link. */}
      <input type="hidden" name="service_user_id" value={chosen?.id ?? ""} />

      {chosen ? (
        <p className="mb-1 mt-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/85">
            <span>{chosen.full_name}</span>
            {chosen.branch_name ? (
              <span className="text-xs text-white/40">{chosen.branch_name}</span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setChosenId(null);
                setQuery("");
              }}
              aria-label={`Remove ${chosen.full_name}`}
              className="text-white/50 hover:text-white"
            >
              ×
            </button>
          </span>
        </p>
      ) : (
        <RecordTypeahead
          id={fieldId}
          query={query}
          choices={choices}
          onQueryChange={setQuery}
          onChoose={(choice) => {
            setChosenId(choice.id);
            setQuery("");
          }}
          noMatchText="No service user matches that name."
        />
      )}

      <p className="form-hint">
        Optional, and any branch. Leave it empty if the complaint is not about one service user.
      </p>
    </div>
  );
}
