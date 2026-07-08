import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { listAllPeopleCheckDefinitions, getColumnLabels } from "@/lib/people/data";
import { updateCheckDefinition, updateColumnLabels } from "@/lib/people/actions";
import { REGISTER_COLUMNS } from "@/lib/people/logic";

export const metadata: Metadata = { title: "People checks" };

export default async function SettingsPeoplePage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels] = await Promise.all([
    listAllPeopleCheckDefinitions(profile.company_id),
    getColumnLabels(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs text-white/50 hover:text-white/80">
          Settings
        </Link>
        <h1 className="page-title mt-1">People checks</h1>
        <p className="page-subtitle">
          Set how often each staff compliance check recurs. Changes apply to future
          scheduling; the amber window updates the register straight away.
        </p>
      </div>

      <div className="space-y-3">
        {definitions.map((def) => {
          const isExpiry = def.anchor === "expiry";
          return (
            <form key={def.id} action={updateCheckDefinition} className="glass-card p-5">
              <input type="hidden" name="definition_id" value={def.id} />
              <input type="hidden" name="anchor" value={def.anchor} />

              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">{def.name}</h2>
                <label className="flex items-center gap-2 text-xs text-white/80">
                  <input type="checkbox" name="active" defaultChecked={def.active} />
                  Active
                </label>
              </div>

              {isExpiry ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor={`flag-${def.id}`} className="form-label">
                      Flag this many days before the recorded expiry
                    </label>
                    <input
                      id={`flag-${def.id}`}
                      name="flag_days"
                      type="number"
                      min={0}
                      defaultValue={def.amber_days ?? 30}
                      className="max-w-[8rem]"
                    />
                  </div>
                  <button type="submit" className="btn-outline text-xs">Save</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label htmlFor={`days-${def.id}`} className="form-label">
                      {def.recurring ? "Every (days)" : "Due after start (days)"}
                    </label>
                    <input
                      id={`days-${def.id}`}
                      name="days"
                      type="number"
                      min={1}
                      defaultValue={def.interval ?? 90}
                      className="max-w-[8rem]"
                    />
                  </div>
                  <div>
                    <label htmlFor={`amber-${def.id}`} className="form-label">
                      Amber (days before due)
                    </label>
                    <input
                      id={`amber-${def.id}`}
                      name="amber_days"
                      type="number"
                      min={0}
                      defaultValue={def.amber_days ?? ""}
                      placeholder="Default 30"
                      className="max-w-[8rem]"
                    />
                  </div>
                  <button type="submit" className="btn-outline text-xs">Save</button>
                </div>
              )}
            </form>
          );
        })}
      </div>

      <p className="text-xs text-white/40">
        Creating brand new check types with their own forms arrives with the form
        builder in a later phase.
      </p>

      <div className="pt-4">
        <h2 className="page-title text-lg">Column names</h2>
        <p className="page-subtitle mb-3">
          Give any register column a shorthand to make it narrower, so more columns
          fit on screen. Leave blank to use the full name.
        </p>
        <form action={updateColumnLabels} className="glass-card space-y-2 p-5">
          {REGISTER_COLUMNS.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <span className="min-w-[11rem] text-sm text-white/80">{c.name}</span>
              <input
                name={`col_${c.key}`}
                defaultValue={columnLabels[c.key] ?? ""}
                placeholder="Shorthand"
                className="max-w-[10rem]"
              />
            </div>
          ))}
          <div className="pt-2">
            <button type="submit" className="btn-outline text-xs">Save column names</button>
          </div>
        </form>
      </div>
    </div>
  );
}
