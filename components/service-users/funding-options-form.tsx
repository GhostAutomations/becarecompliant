"use client";

/**
 * Be Care Compliant — the funding types this company accepts.
 *
 * Phil, 2026-09-09: "when admin sets the company account up, they can choose what funding
 * options they accept so the whole list isnt visible in the Service user setup form."
 *
 * Ten genuine ways a package is paid for, and no agency takes all ten. What is ticked here is
 * what the Setup Visit offers, so the person filling that in reads three answers rather than
 * reading past seven that are never true for them.
 *
 * NOT ActionForm, and that is the whole point (Phil, 2026-09-09: "when you click save, the
 * ticks disappear"). ActionForm submits through <form action={...}>, and React 19 RESETS a
 * form's fields once its action resolves. Every tick was written correctly — the database and
 * the Setup Visit both had five — but form.reset() unticked the boxes on screen, and because
 * the component's own state had not changed React saw nothing to re-render and never put them
 * back. A screen saying the opposite of the record it just wrote, which is the exact class of
 * defect this project keeps meeting.
 *
 * A transition and an ordinary button instead: no <form action>, so nothing resets, and the
 * ticks are only ever React state. Same pattern as OutcomesIntervalForm next door.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFundingOptions } from "@/lib/service-users/actions";
import { useSavedFlash } from "@/lib/use-saved-flash";
import type { FundingOption } from "@/lib/service-users/data";

export default function FundingOptionsForm({ options }: { options: FundingOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, flash, resetFlash] = useSavedFlash();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(options.filter((o) => o.accepted).map((o) => o.key)),
  );

  function toggle(key: string) {
    resetFlash();
    setError(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    const fd = new FormData();
    for (const key of chosen) fd.append("options", key);
    startTransition(async () => {
      const result = await setFundingOptions({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      flash();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={chosen.has(o.key)}
              onChange={() => toggle(o.key)}
              disabled={pending}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/85">{o.label}</span>
              {o.description ? (
                <span className="block text-xs text-white/45">{o.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <p className={chosen.size === 0 ? "form-hint text-rag-red-soft" : "form-hint"}>
        {chosen.size === 0
          ? "Choose at least one. The Setup Visit has to offer something."
          : `${chosen.size} of ${options.length} accepted. Only these appear on the Setup Visit.`}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || chosen.size === 0}
          className={saved ? "btn-saved text-xs" : "btn-primary text-xs"}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save funding options"}
        </button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>
    </div>
  );
}
