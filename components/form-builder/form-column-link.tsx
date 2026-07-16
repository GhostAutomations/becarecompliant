"use client";

/**
 * Be Care Compliant — link a form to a register column (a compliance check) from
 * the Forms list. Changing the dropdown saves immediately via the server action.
 * Kept out of the row's Link so selecting never navigates to the editor.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { setFormColumnLink } from "@/app/(app)/settings/forms/actions";

export default function FormColumnLink({
  formId,
  checks,
  currentCheckId,
}: {
  formId: string;
  checks: Array<{ id: string; name: string }>;
  currentCheckId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentCheckId);
  const [error, setError] = useState(false);

  function onChange(next: string) {
    setValue(next);
    setError(false);
    const fd = new FormData();
    fd.set("form_id", formId);
    fd.set("check_id", next);
    startTransition(async () => {
      const res = await setFormColumnLink(IDLE_STATE, fd);
      if (res.error) setError(true);
      else router.refresh();
    });
  }

  return (
    <select
      aria-label="Link this form to a column"
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className={`max-w-[11rem] text-xs ${error ? "border-rag-red" : ""}`}
    >
      <option value="">No column</option>
      {checks.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
