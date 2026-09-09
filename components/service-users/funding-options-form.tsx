"use client";

/**
 * Be Care Compliant — the funding types this company accepts, and which of them it invoices.
 *
 * Phil, 2026-09-09: "when admin sets the company account up, they can choose what funding
 * options they accept so the whole list isnt visible in the Service user setup form", then
 * "if they tick an option, on the right have a greyed out box; if something is ticked the
 * greyed box becomes active so you can check it, and if checked then when the funding option
 * is selected in the setup visit they will be added to private invoicing."
 *
 * Two questions per row, and they are genuinely different. The LEFT box is "do we take this
 * kind of work", which decides what the Setup Visit offers. The RIGHT box is "do we send the
 * invoice ourselves", which decides whether completing a Setup Visit puts a payer on the
 * Invoicing books. A council-commissioned package is taken by nearly everyone and invoiced
 * directly by nearly nobody, which is why one box could never answer both.
 *
 * The right box is disabled until the left one is ticked, because "we invoice this ourselves"
 * says nothing about funding we do not take. Unticking the left box clears the right one
 * rather than leaving a hidden yes behind it — the server refuses that pairing anyway, and a
 * remembered tick you cannot see is worse than losing one you can re-make.
 *
 * NOT ActionForm. It submits through <form action={...}> and React 19 resets a form's fields
 * once its action resolves, which unticked every box while the save itself was correct
 * (Phil, 2026-09-09: "when you click save, the ticks disappear").
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
  const [accepted, setAccepted] = useState<Set<string>>(
    () => new Set(options.filter((o) => o.accepted).map((o) => o.key)),
  );
  const [billed, setBilled] = useState<Set<string>>(
    () => new Set(options.filter((o) => o.billsPrivately).map((o) => o.key)),
  );

  function touched() {
    resetFlash();
    setError(null);
  }

  function toggleAccepted(key: string) {
    touched();
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setBilled((b) => {
          if (!b.has(key)) return b;
          const nb = new Set(b);
          nb.delete(key);
          return nb;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleBilled(key: string) {
    touched();
    setBilled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    const fd = new FormData();
    for (const key of accepted) fd.append("options", key);
    for (const key of billed) if (accepted.has(key)) fd.append("bills", key);
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
      <div className="flex items-end justify-between gap-3 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          We accept this funding
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          We invoice it ourselves
        </span>
      </div>

      <div className="space-y-2">
        {options.map((o) => {
          const isAccepted = accepted.has(o.key);
          return (
            <div
              key={o.key}
              className="flex items-start gap-3 rounded-xl border border-white/10 px-4 py-3"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isAccepted}
                  onChange={() => toggleAccepted(o.key)}
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

              <label
                className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                  isAccepted
                    ? "cursor-pointer border border-white/10 hover:bg-white/5"
                    : "cursor-not-allowed border border-white/5 opacity-40"
                }`}
                title={
                  isAccepted
                    ? "Completing a Setup Visit with this funding adds the payer to Invoicing"
                    : "Accept this funding first"
                }
              >
                <input
                  type="checkbox"
                  checked={isAccepted && billed.has(o.key)}
                  onChange={() => toggleBilled(o.key)}
                  disabled={pending || !isAccepted}
                  className="shrink-0"
                />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                  Invoice
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <p className={accepted.size === 0 ? "form-hint text-rag-red-soft" : "form-hint"}>
        {accepted.size === 0
          ? "Choose at least one. The Setup Visit has to offer something."
          : `${accepted.size} of ${options.length} accepted, ${billed.size} invoiced by you. A Setup Visit answering an invoiced funding type adds that person to Private Clients.`}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || accepted.size === 0}
          className={saved ? "btn-saved text-xs" : "btn-primary text-xs"}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save funding options"}
        </button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>
    </div>
  );
}
