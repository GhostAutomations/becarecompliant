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
 * The count is shown live rather than only after saving, because the one state worth
 * preventing — nothing ticked — otherwise looks fine until the server refuses it.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { setFundingOptions } from "@/lib/service-users/actions";
import type { FundingOption } from "@/lib/service-users/data";

export default function FundingOptionsForm({ options }: { options: FundingOption[] }) {
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(options.filter((o) => o.accepted).map((o) => o.key)),
  );

  function toggle(key: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <ActionForm action={setFundingOptions} label="Save funding options">
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5"
          >
            <input
              type="checkbox"
              name="options"
              value={o.key}
              checked={chosen.has(o.key)}
              onChange={() => toggle(o.key)}
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
    </ActionForm>
  );
}
