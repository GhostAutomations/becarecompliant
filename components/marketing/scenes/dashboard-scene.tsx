import { s } from "./class-names";

/**
 * Be Care Compliant: the dashboard's "what is coming at me" row and branch readiness, as the app
 * draws them (app/(app)/dashboard/page.tsx): Overdue, then Due in 7, 14 and 30 days as separate
 * bands with the app's own captions, and the readiness card with one line per branch and its
 * weakest theme (On track, Attention, Action needed). Calm: nothing moves. This replaces a
 * "North, South, East branch" picture that no screen in the app actually draws.
 */

function Tile({ label, value, tone, sub }: { label: string; value: string; tone: "red" | "amber" | "none"; sub: string }) {
  const ink = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="glass-card flex flex-col p-4">
      <p className="truncate text-[11px] uppercase tracking-wide text-white/55">{label}</p>
      <p className={`mt-2 text-[32px] font-bold leading-none tabular-nums ${ink}`}>{value}</p>
      <p className="mt-3 text-[11px] leading-snug text-white/55">{sub}</p>
    </div>
  );
}

export default function DashboardScene() {
  return (
    <div className={s.frame}>
      <p className="sr-only">
        The Be Care Compliant dashboard: how many checks are overdue and due in the next 7, 14 and 30 days, and
        where each branch stands for its regulator.
      </p>
      <div aria-hidden className="space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Overdue" value="2" tone="red" sub="1 person, 1 Service User, 0 for training" />
          <Tile label="Due in 7 days" value="4" tone="amber" sub="checks and training, today to day 7" />
          <Tile label="Due in 14 days" value="6" tone="none" sub="checks and training, days 8 to 14" />
          <Tile label="Due in 30 days" value="11" tone="none" sub="checks and training, days 15 to 30" />
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/55">CIW readiness</p>
          <div className="mt-2 space-y-1">
            {[
              { name: "Riverside", word: "On track", ink: "text-emerald-300" },
              { name: "Hillview", word: "Attention", ink: "text-amber-300" },
              { name: "Meadow Court", word: "On track", ink: "text-emerald-300" },
            ].map((b) => (
              <div key={b.name} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">{b.name}</span>
                <span className={`text-[11px] font-semibold ${b.ink}`}>{b.word}</span>
              </div>
            ))}
            <span className="block pt-0.5 text-[11px] font-semibold text-gold-300">Readiness breakdown &rsaquo;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
