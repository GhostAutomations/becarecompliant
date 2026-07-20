import Link from "next/link";
import { PRICING_TIERS, PRICING_FOOTNOTE } from "@/lib/marketing/tiers";

export default function PricingTiers() {
  return (
    <div>
      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
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
              <span className="text-3xl font-bold text-white">{t.price}</span>
              <span className="text-sm text-white/55">{t.cadence}</span>
            </div>
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
              Start free trial
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/50">{PRICING_FOOTNOTE}</p>
    </div>
  );
}
