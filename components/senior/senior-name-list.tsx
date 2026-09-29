import BackLink from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";

/**
 * A Senior's People or Service Users page: names, and nothing else (Phil, 2026-09-29: "all
 * they should be able to see is a list of people's names basically").
 *
 * The names come from senior_name_list (migration 0338), which returns a name and a branch for
 * current records in the Senior's own branches, and only for the lists their company left ticked
 * on the Senior tile in Role access. No ids, so there is nothing to open, and no other column.
 */
export default async function SeniorNameList({ kind }: { kind: "people" | "service_users" }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("senior_name_list", { p_kind: kind });
  const rows = ((data as Array<{ full_name: string; branch_name: string | null }> | null) ?? []).filter(
    (r) => r.full_name,
  );

  const byBranch = new Map<string, string[]>();
  for (const r of rows) {
    const key = r.branch_name ?? "No branch";
    byBranch.set(key, [...(byBranch.get(key) ?? []), r.full_name]);
  }
  const branches = [...byBranch.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const title = kind === "people" ? "People" : "Service Users";
  const noun = kind === "people" ? "staff" : "service users";

  return (
    <div className="page-shell space-y-4">
      <BackLink href="/my" label="Back to My area" />
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">
          The {noun} in your branch{branches.length === 1 ? "" : "es"}, by name.
        </p>
      </div>

      {error ? (
        <div className="glass-card p-6 text-sm text-red-300">
          The list could not be loaded. Please try again, and tell your manager if it keeps happening.
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          There are no {noun} to show. If you expected some, ask your manager to check which branch you are in.
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map(([branch, names]) => (
            <section key={branch} className="glass-card p-5">
              <h2 className="text-sm font-semibold text-white/80">
                {branch} <span className="font-normal text-white/45">· {names.length}</span>
              </h2>
              <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm text-white/85 sm:grid-cols-2 lg:grid-cols-3">
                {names.map((n, i) => (
                  <li key={`${n}-${i}`}>{n}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
