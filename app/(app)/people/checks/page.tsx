import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { listAllPeopleCheckDefinitions } from "@/lib/people/data";
import { updateCheckDefinition } from "@/lib/people/actions";
import { recurrenceLabel } from "@/lib/people/logic";

export const metadata: Metadata = { title: "Configure checks" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];
const FREQUENCIES: Array<{ value: string; label: string }> = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "year", label: "years" },
];

export default async function CheckConfigPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/people");

  const definitions = await listAllPeopleCheckDefinitions(profile.company_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/people" className="text-xs text-white/50 hover:text-white/80">
          People
        </Link>
        <h1 className="page-title mt-1">Configure People checks</h1>
        <p className="page-subtitle">
          Adjust how often each check recurs and when it turns amber. Changes apply
          to future scheduling; the amber window updates the register straight away.
        </p>
      </div>

      <div className="space-y-3">
        {definitions.map((def) => (
          <form key={def.id} action={updateCheckDefinition} className="glass-card p-5">
            <input type="hidden" name="definition_id" value={def.id} />
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">{def.name}</h2>
                <p className="text-[11px] text-white/45">{recurrenceLabel(def)}</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/80">
                <input type="checkbox" name="active" defaultChecked={def.active} />
                Active
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor={`int-${def.id}`} className="form-label">Every</label>
                <input
                  id={`int-${def.id}`}
                  name="interval"
                  type="number"
                  min={1}
                  defaultValue={def.interval ?? 1}
                  disabled={def.anchor === "expiry"}
                />
              </div>
              <div>
                <label htmlFor={`freq-${def.id}`} className="form-label">Period</label>
                <select
                  id={`freq-${def.id}`}
                  name="frequency"
                  defaultValue={def.frequency ?? "month"}
                  disabled={def.anchor === "expiry"}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`amber-${def.id}`} className="form-label">Amber (days)</label>
                <input
                  id={`amber-${def.id}`}
                  name="amber_days"
                  type="number"
                  min={0}
                  defaultValue={def.amber_days ?? ""}
                  placeholder="Company default"
                />
              </div>
            </div>

            {def.anchor === "expiry" ? (
              <p className="form-hint">
                This check is scheduled from the document expiry date recorded on the
                form, so its period is fixed.
              </p>
            ) : null}

            <div className="mt-4">
              <button type="submit" className="btn-outline text-xs">Save</button>
            </div>
          </form>
        ))}
      </div>

      <p className="text-xs text-white/40">
        Creating brand new check types with their own forms arrives with the form
        builder in a later phase.
      </p>
    </div>
  );
}
