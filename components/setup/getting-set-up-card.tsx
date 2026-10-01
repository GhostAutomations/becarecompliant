import Link from "next/link";
import type { SetupCard } from "@/lib/setup/status";
import NotNeededButton from "./not-needed-button";

/**
 * The "Getting set up" card (Phil, 2026-10-01). On the Company Admin's dashboard while anything
 * is left to do, and on the founder company page always. A plain <details>, open by default on
 * the dashboard, so it can be folded away without being dismissed.
 */
export default function GettingSetUpCard({
  companyId,
  card,
  defaultOpen = true,
  title = "Getting set up",
  links = true,
}: {
  companyId: string;
  card: SetupCard;
  defaultOpen?: boolean;
  title?: string;
  /** Off on the founder company page: the steps open the company's own Settings, which the
   *  founder only reaches through Manage as company. */
  links?: boolean;
}) {
  const pct = card.total ? Math.round((card.settled / card.total) * 100) : 0;
  return (
    <details className="fold glass-card group overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 transition hover:bg-white/[0.04] group-open:rounded-b-none">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">{title}</span>
            <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs text-white/70">
              {card.settled} of {card.total}
            </span>
          </span>
          <span
            className="mt-2 block h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={card.total}
            aria-valuenow={card.settled}
            aria-label={`${card.settled} of ${card.total} set up steps settled`}
          >
            <span className="block h-full rounded-full bg-gold-400" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span aria-hidden className="fold-chevron shrink-0 text-lg text-white/40 transition-transform">
          ›
        </span>
      </summary>
      <div className="grid gap-5 border-t border-white/10 px-5 py-5 md:grid-cols-2">
        {card.groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{g.title}</h3>
            <ul className="space-y-2">
              {g.steps.map((s) => (
                <li key={s.key} className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        s.state === "done"
                          ? "border-transparent bg-[rgba(0,200,117,0.2)] rag-text-green"
                          : s.state === "not_needed"
                            ? "border-white/20 text-white/40"
                            : "border-white/30"
                      }`}
                    >
                      {s.state === "done" ? "✓" : s.state === "not_needed" ? "–" : ""}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="sr-only">
                        {s.state === "done" ? "Done: " : s.state === "not_needed" ? "Not needed: " : "To do: "}
                      </span>
                      {s.state === "todo" && s.href && links ? (
                        <Link href={s.href} className="text-white/90 underline decoration-white/25 underline-offset-2 hover:decoration-white/70">
                          {s.label}
                        </Link>
                      ) : (
                        <span className={s.state === "todo" ? "text-white/90" : "text-white/50"}>{s.label}</span>
                      )}
                      {s.hint && s.state === "todo" ? (
                        <span className="block text-xs text-white/50">{s.hint}</span>
                      ) : s.hint && s.state === "done" && s.key === "payment" ? (
                        <span className="block text-xs text-white/45">{s.hint}</span>
                      ) : null}
                    </span>
                  </span>
                  {s.state !== "done" ? (
                    <NotNeededButton companyId={companyId} stepKey={s.key} notNeeded={s.state === "not_needed"} />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
