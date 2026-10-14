import Story from "./story";
import { d } from "./timing";
import { s } from "./class-names";

/**
 * Be Care Compliant: the lead story, the compliance loop (Phil, 2026-10-14).
 *
 * Ffion's Supervision 2 is overdue (red). A supervision form is completed, and exactly what the
 * app does follows: the red pill on the Due date clears to plain text, the Done date is stamped
 * with today in AMBER because it was done late (Phil's popup: "Overdue, then done late in amber",
 * components/people/register-matrix.tsx DoneDate), Supervision 3 appears with its due date in
 * green, the dashboard's Overdue figure ticks down by one, and the branch's readiness line rolls
 * up from Action needed to On track (lib/framework/theme-status.ts: no open overdue checks).
 *
 * About five seconds, once. Drawn in its final state; see story.tsx for how it plays.
 */

const TODAY = "14 Oct 26";

export default function LoopStory() {
  return (
    <Story
      durationMs={5200}
      label="A short animation: an overdue supervision is completed, its due date turns from red to done, today's date is stamped, the next supervision is scheduled, and the overdue count on the dashboard drops by one."
      className={s.frame}
    >
      <div className="relative space-y-3 p-4 pb-12 sm:p-5 sm:pb-12">
        {/* The dashboard, above: the Overdue tile and the branch readiness card. */}
        <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
          <div className="glass-card p-4">
            <p className="truncate text-[11px] uppercase tracking-wide text-white/55">Overdue</p>
            <p className="mt-2 text-[32px] font-bold leading-none tabular-nums text-red-300">
              <span className={`${s.swap} ${s.swapStart}`}>
                <span className={s.countOld} style={d(3500)}>3</span>
                <span className={s.countNew} style={d(3550)}>2</span>
              </span>
            </p>
            <p className="mt-3 text-[11px] leading-snug text-white/55">
              <span className={`${s.swap} ${s.swapStart}`}>
                <span className={s.before} style={d(3500)}>2 people, 1 Service User, 0 for training</span>
                <span className={s.after} style={d(3550)}>1 person, 1 Service User, 0 for training</span>
              </span>
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-white/55">CIW readiness</p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">Riverside</span>
                <span className={`${s.swap} justify-items-end text-[11px] font-semibold`}>
                  <span className={`${s.before} text-red-300`} style={d(4300)}>Action needed</span>
                  <span className={`${s.after} text-emerald-300`} style={d(4350)}>On track</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">Hillview</span>
                <span className="text-[11px] font-semibold text-amber-300">Attention</span>
              </div>
              <span className="block pt-0.5 text-[11px] font-semibold text-gold-300">Readiness breakdown &rsaquo;</span>
            </div>
          </div>
        </div>

        {/* The People register: one carer's supervision cycle. */}
        <div className={`relative ${s.matrixClip} ${s.compact} ${s.wrapHead}`}>
          <table className="matrix">
            <thead>
              <tr>
                <th className="col-carer">Carer</th>
                <th>Supervision 2 Due</th>
                <th>Supervision 2 Done</th>
                <th>Supervision 3 Due</th>
              </tr>
            </thead>
            <tbody>
              <tr className="relative">
                <td className="col-carer">Ffion Rees</td>
                <td>
                  <span className={s.swap}>
                    <span className={`${s.before} rag-cell rag-cell-red`} style={d(2200)}>12 Sep 26</span>
                    <span className={s.after} style={d(2250)}>12 Sep 26</span>
                  </span>
                </td>
                <td>
                  <span className={s.swap}>
                    <span className={s.before} style={d(2600)}>—</span>
                    <span className={`${s.after} done-late`} style={d(2650)}>{TODAY}</span>
                  </span>
                </td>
                <td>
                  <span className={s.swap}>
                    <span className={`${s.before} rag-cell rag-cell-none`} style={d(3000)}>—</span>
                    <span className={`${s.after} rag-cell rag-cell-green`} style={d(3050)}>14 Jan 27</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <span className={s.glow} style={d(2100)} />
        </div>

        {/* The form, visiting: completed and saved, then gone. */}
        <div
          className={`${s.visit} absolute inset-x-6 bottom-4 rounded-2xl border border-white/15 bg-navy-900 p-4 shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-6 sm:w-80`}
          style={d(300, 1800)}
        >
          <p className="text-sm font-semibold text-white">Supervision 2</p>
          <p className="text-[11px] text-white/55">Ffion Rees, Riverside</p>
          <div className="mt-3 space-y-2 text-[11px]">
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/80">
              Date of supervision: 14/10/2026
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/80">
              Wellbeing, workload and training discussed
            </div>
          </div>
          <span className={`${s.press} mt-3 inline-flex`} style={d(1100)}>
            <span className="btn-primary px-3 py-1.5 text-xs">
              <span className={s.swap}>
                <span className={s.before} style={d(1250)}>Complete and save evidence</span>
                <span className={s.after} style={d(1300)}>Saving…</span>
              </span>
            </span>
          </span>
        </div>
      </div>
    </Story>
  );
}
