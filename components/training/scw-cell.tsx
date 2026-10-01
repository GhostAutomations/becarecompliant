"use client";

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { updateScwNumber } from "@/lib/people/actions";
import type { ScwStatus } from "@/lib/people/scw";

/**
 * THE SCW NUMBER COLUMN on the Training matrix (DEF-097, Phil 2026-10-01: "like the column on my
 * Monday board"). Shows the Social Care Wales registration number, or says it is missing once the
 * person has been 6 months in post (what the PQS counts). A person you can edit opens a small box
 * to type or correct it, in place.
 */
export default function ScwCell({
  personId,
  personName,
  number,
  status,
  editable,
}: {
  personId: string;
  personName: string;
  number: string | null;
  status: ScwStatus;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex min-w-[13rem] flex-col gap-1 text-left">
        <ActionForm
          action={updateScwNumber}
          hidden={{ person_id: personId }}
          label="Save"
          inline
          onDone={() => setEditing(false)}
          onDoneDelayMs={600}
        >
          <input
            name="scw_registration_number"
            defaultValue={number ?? ""}
            maxLength={20}
            autoComplete="off"
            autoFocus
            aria-label={`Social Care Wales registration number for ${personName}`}
          />
        </ActionForm>
        <button type="button" onClick={() => setEditing(false)} className="self-start text-xs text-white/50 hover:text-white">
          Cancel
        </button>
      </div>
    );
  }

  const text = number ?? (status === "missing" ? "Missing" : "Not yet");
  const tone = number ? "text-white/85" : status === "missing" ? "text-rag-amber-soft font-semibold" : "text-white/40";
  const title = number
    ? `Social Care Wales registration ${number}`
    : status === "missing"
      ? "6 months or more in post with no registration number: the PQS counts this"
      : "Under 6 months in post";

  if (!editable) {
    return (
      <span className={`text-xs tabular-nums ${tone}`} title={title}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-xs tabular-nums underline decoration-white/15 underline-offset-2 hover:decoration-white/60 ${tone}`}
      title={`${title}. Click to change.`}
    >
      {text}
    </button>
  );
}
