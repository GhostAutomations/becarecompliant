import BackLink from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import SeniorNameButton from "@/components/senior/senior-name-button";
import { groupSeniorRegister, seniorFormStatus, type SeniorRegisterRow } from "@/lib/senior/register";

/**
 * A Senior's People or Service Users page (0338, 0339).
 *
 * Phil, 2026-09-29: "each name should be its own gold button. And the spot check they are going
 * to do, they should literally click that name and then it opens up the form or forms." So the
 * page is names, as gold buttons, grouped by branch. A name opens its form straight away, or a
 * small choice when the company has ticked more than one Check for Seniors. No wall of rows, no
 * statuses on the page itself.
 *
 * A name with nothing for the Senior to complete (their own, or a record with none of the ticked
 * Checks) is left off: a button that opens nothing is worse than no button. When NO Check is
 * ticked at all, the list goes back to plain names, which is what a Senior had before 0339.
 *
 * Everything comes from senior_register, which applies every rule in the database (branches,
 * current records, the list and each Check ticked, never their own record); the Complete page
 * asks the database again before it opens.
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
  const root = kind === "people" ? "/people" : "/service-users";

  const withForms = branches
    .map((b) => ({
      name: b.name,
      records: b.records
        .map((r) => ({
          id: r.id,
          name: r.name,
          forms: r.checks
            .filter((c) => c.hasForm)
            .map((c) => ({ href: `${root}/${r.id}/checks/${c.instanceId}/complete`, name: c.name, status: seniorFormStatus(c) })),
        }))
        .filter((r) => r.forms.length > 0),
    }))
    .filter((b) => b.records.length > 0);
  const namesOnly = withForms.length === 0;
  const shown = namesOnly ? branches : withForms;
  const count = shown.reduce((n, b) => n + b.records.length, 0);

  const title = kind === "people" ? "People" : "Service Users";
  const noun = kind === "people" ? "staff" : "service users";

  return (
    <div className="page-shell space-y-4">
      <BackLink href="/my" label="Back to My area" />
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">
          {namesOnly
            ? `The ${noun} in your branch${branches.length === 1 ? "" : "es"}.`
            : "Tap a name to open the form."}
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
      ) : count === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          There are no {noun} to show. If you expected some, ask your manager to check which branch you are in.
        </div>
      ) : (
        <div className="space-y-4">
          {namesOnly
            ? branches.map((b) => (
                <section key={b.name} className="glass-card p-5">
                  <h2 className="text-sm font-semibold text-white/80">{b.name}</h2>
                  <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm text-white/85 sm:grid-cols-2 lg:grid-cols-3">
                    {b.records.map((r) => (
                      <li key={r.id}>{r.name}</li>
                    ))}
                  </ul>
                </section>
              ))
            : withForms.map((b) => (
                <section key={b.name} className="glass-card p-5">
                  <h2 className="text-sm font-semibold text-white/80">{b.name}</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {b.records.map((r) => (
                      <SeniorNameButton key={r.id} name={r.name} forms={r.forms} />
                    ))}
                  </div>
                </section>
              ))}
        </div>
      )}
    </div>
  );
}
