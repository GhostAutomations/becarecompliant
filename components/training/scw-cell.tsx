"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { updateScwNumber } from "@/lib/people/actions";
import type { ScwStatus } from "@/lib/people/scw";

/**
 * THE SCW NUMBER COLUMN on the Training matrix (DEF-097, Phil 2026-10-01: "like the column on my
 * Monday board"). Shows the Social Care Wales registration number, or says it is missing once the
 * person has been 6 months in post (what the PQS counts). A person you can edit opens a popup to
 * type or correct it, like a training date.
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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const close = () => setEditing(false);
  const done = () => {
    close();
    router.refresh();
  };

  /* THE SAME POPUP AS A TRAINING DATE (Phil, 2026-10-01: "the same as if I click a date in the
     training matrix"): it opened inside the column and pushed the column wide. Portalled to the
     body so the table's sticky columns and scroll area cannot clip or offset it. */
  const dialog =
    editing && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Social Care Wales registration number for ${personName}`}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 text-left shadow-2xl">
              <h2 className="text-lg font-semibold text-white">Social Care Wales registration</h2>
              <p className="mt-1 text-sm text-white/55">{personName}</p>
              <ActionForm
                action={updateScwNumber}
                hidden={{ person_id: personId }}
                label="Save"
                buttonClassName="btn-primary px-4 py-2 text-sm"
                className="mt-5 space-y-4"
                onDone={done}
              >
                <div>
                  <label htmlFor={`scw_${personId}`} className="form-label">
                    Registration number
                  </label>
                  <input
                    id={`scw_${personId}`}
                    name="scw_registration_number"
                    defaultValue={number ?? ""}
                    maxLength={20}
                    autoComplete="off"
                    autoFocus
                  />
                  <p className="form-hint">
                    Leave it blank and save to remove it. The PQS counts anyone 6 months in post without one.
                  </p>
                </div>
              </ActionForm>
              <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
                <button type="button" onClick={close} className="btn-ghost ml-auto px-3 py-2 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const text = number ?? (status === "missing" ? "Missing" : "Under 6 months");
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
    <>
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-xs tabular-nums underline decoration-white/15 underline-offset-2 hover:decoration-white/60 ${tone}`}
      title={`${title}. Click to change.`}
    >
      {text}
    </button>
    {dialog}
    </>
  );
}
