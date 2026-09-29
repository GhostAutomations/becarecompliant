"use client";

/**
 * The two plan cards on the pricing page, with the Monthly / Annual switch (Phil, 2026-09-29).
 * Annual is ten months for twelve. It is shown because the founder sets annual up by hand
 * with the client until annual card billing is built; the buttons request a trial either way.
 * Prices come from lib/marketing/tiers.ts, which the price consistency test holds to the code.
 */

import { useState } from "react";
import Link from "next/link";
import { PRICING_TIERS } from "@/lib/marketing/tiers";
import { ONBOARDING_FEE, ONBOARDING_OFFER_END_TEXT } from "@/lib/marketing/offer";

type Period = "monthly" | "annual";

export default function PricingTiers({ offerActive }: { offerActive: boolean }) {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <div>
      <div className="flex justify-center">
        <div role="tablist" aria-label="Billing period" className="inline-flex rounded-full border border-white/15 bg-white/10 p-1">
          {(["monthly", "annual"] as const).map((p) => {
            const on = period === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${on ? "bg-white text-navy-950" : "text-white/60 hover:text-white"}`}
              >
                {p === "monthly" ? "Monthly" : "Annual"}
                {p === "annual" ? (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-gold-400/30 text-gold-600" : "bg-gold-400/15 text-gold-300"}`}>
                    2 months free
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
        {PRICING_TIERS.map((t) => (
          <div
            key={t.key}
            className={`glass-card flex flex-col p-6 ${t.featured ? "ring-1 ring-gold-400/60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{t.name}</h3>
              {t.featured ? (
                <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-[11px] font-semibold text-gold-300">
                  Most popular
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-white/60">{t.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold text-white">{period === "monthly" ? t.price : t.annualPrice}</span>
              <span className="text-sm text-white/55">{period === "monthly" ? t.cadence : "per year"}</span>
            </div>
            <p className="mt-1 text-xs text-white/60">
              {period === "monthly" ? (
                "Plus VAT, billed monthly"
              ) : (
                <>
                  Plus VAT. <span className="font-semibold text-gold-300">Save {t.annualSaving}</span> against paying monthly
                </>
              )}
            </p>
            {t.inherits ? (
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-white/50">{t.inherits}</p>
            ) : null}
            <ul className="mt-3 space-y-2.5 text-sm text-white/80">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span aria-hidden className="mt-0.5 text-gold-400">&#10003;</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/start-trial?tier=${t.key}`}
              className={`mt-6 w-full justify-center text-sm ${t.featured ? "btn-primary" : "btn-outline"}`}
            >
              Request a trial
            </Link>
            <p className="mt-3 text-center text-xs text-white/60">
              {offerActive ? (
                <>
                  Onboarding <s className="text-white/45">{ONBOARDING_FEE}</s>{" "}
                  <span className="font-semibold text-gold-300">free until {ONBOARDING_OFFER_END_TEXT}</span>
                </>
              ) : (
                <>Onboarding {ONBOARDING_FEE} one off, free on annual plans</>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
