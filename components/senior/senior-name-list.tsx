import Link from "next/link";
import BackLink from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { ukDate } from "@/lib/dates";
import {
  groupSeniorRegister,
  overdueCount,
  seniorPillClass,
  seniorPillLabel,
  type SeniorRegisterRow,
} from "@/lib/senior/register";

/**
 * A Senior's People or Service Users page (0338, 0339).
 *
 * Names from their own branch(es), and under each name the Checks their company left ticked on
 * the Senior tile in Role access: the status, the due date, and Complete (Phil, 2026-09-29).
 * Nothing else about the record: no contact details, no past Evidence, no record page to open.
 *
 * Everything comes from senior_register, which applies every rule in the database: the Senior's
 * branches, current records only, the list ticked, each Check ticked. The Complete link goes to
 * the same Complete page a Manager uses, and that page asks the database again before it opens.
 */
export type SeniorOutcome = { completed?: string; recorded?: string; history?: string; warn?: string };

export default async function SeniorNameList({
  kind,
  outcome = {},
}: {
  kind: "people" | "service_users";
  outcome?: SeniorOutcome;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("senior_register", { p_kind: kind });
  const branches = groupSeniorRegister((data as SeniorRegisterRow[] | null) ?? []);
  const people = branches.reduce((n, b) => n + b.records.length, 0);
  const overdue = overdueCount(branches);
  const anyChecks = branches.some((b) => b.records.some((r) => r.checks.length > 0));

  const title = kind === "people" ? "People" : "Service Users";
  const noun = kind === "people" ? "staff" : "service users";
  const root = kind === "people" ? "/people" : "/service-users";

  return (
    <div className="page-shell space-y-4">
      <BackLink href="/my" label="Back to My area" />
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">
          The {noun} in your branch{branches.length === 1 ? "" : "es"}
          {anyChecks ? ", with the checks you complete" : ""}.
          {overdue > 0 ? ` ${overdue} ${overdue === 1 ? "check is" : "checks are"} overdue.` : ""}
        </p>
      </div>

      {outcome.warn ? (
        <div className="glass-card border border-rag-red/30 p-4 text-sm text-rag-red-soft">{outcome.warn}</div>
      ) : null}
      {outcome.completed ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          {outcome.completed} completed. Evidence stored and the next due date scheduled.
        </div>
      ) : null}
      {outcome.history ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          {outcome.history} added to the history. It is dated before the one already on file, so the next
          due date has not changed.
        </div>
      ) : null}
      {outcome.recorded ? (
        <div className="glass-card border border-rag-amber/25 p-4 text-sm text-rag-amber-soft">
          {outcome.recorded} recorded as not completed. Evidence stored with the reason, and the check is
          still due.
        </div>
      ) : null}

      {error ? (
        <div className="glass-card p-6 text-sm text-red-300">
          The list could not be loaded. Please try again, and tell your manager if it keeps happening.
        </div>
      ) : people === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          There are no {noun} to show. If you expected some, ask your manager to check which branch you are in.
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map((b) => (
            <section key={b.name} className="glass-card p-5">
              <h2 className="text-sm font-semibold text-white/80">
                {b.name} <span className="font-normal text-white/45">· {b.records.length}</span>
              </h2>
              {b.records.some((r) => r.checks.length > 0) ? (
                <ul className="mt-3 divide-y divide-white/10">
                  {b.records.map((r) => (
                    <li key={r.id} className="py-3">
                      <p className="text-sm font-medium text-white/90">{r.name}</p>
                      {r.checks.length > 0 ? (
                        <ul className="mt-2 space-y-1.5">
                          {r.checks.map((c) => (
                            <li key={c.instanceId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                              <span className="min-w-[8rem] text-white/75">{c.name}</span>
                              <span className={seniorPillClass(c.rag)}>{seniorPillLabel(c)}</span>
                              <span className="text-white/50">
                                {c.dueDate ? `Due ${ukDate(c.dueDate)}` : c.lastCompletedOn ? `Last done ${ukDate(c.lastCompletedOn)}` : ""}
                              </span>
                              {c.hasForm ? (
                                <Link
                                  href={`${root}/${r.id}/checks/${c.instanceId}/complete`}
                                  className="btn-outline ml-auto px-3 py-1.5 text-xs"
                                >
                                  Complete
                                </Link>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm text-white/85 sm:grid-cols-2 lg:grid-cols-3">
                  {b.records.map((r) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
