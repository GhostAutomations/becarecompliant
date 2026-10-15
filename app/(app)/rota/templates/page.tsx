import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches, getRotaTemplates } from "@/lib/rota/data";
import ActionForm from "@/components/action-form";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import { archiveTemplateAction, saveTemplateAction } from "@/lib/rota/actions";
import type { RotaTemplate } from "@/lib/rota/types";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Rota templates" };
}

/** Shift templates per branch: the usual shifts, added to a day in one tap (Stage 1). */
export default async function RotaTemplatesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const templates = branch ? await getRotaTemplates(branch.id) : [];

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <h1 className="page-title">Shift templates</h1>
        <p className="text-sm text-white/60">Your usual shifts, such as Early, Late or Waking night, ready to add to any day.</p>
      </div>
      {branch ? <RotaTabs active="templates" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/templates?branch=${b.id}`} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!branch ? (
        <p className="text-sm text-white/55">You are not linked to a branch yet.</p>
      ) : (
        <>
          <section aria-label="Templates" className="glass-card space-y-3 p-4">
            {templates.length === 0 ? (
              <p className="text-sm text-white/55">No templates yet. Add your first one below.</p>
            ) : (
              <ul className="space-y-3">
                {templates.map((t) => (
                  <li key={t.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <TemplateForm branchId={branch.id} t={t} />
                    <div className="mt-2 flex justify-end">
                      <ActionForm
                        action={archiveTemplateAction}
                        hidden={{ template_id: t.id }}
                        label="Remove"
                        savingLabel="Removing…"
                        savedLabel="Removed"
                        buttonClassName="btn-ghost px-2 py-1 text-xs"
                        className=""
                        confirm={`Remove the ${t.name} template? Shifts already made from it are kept.`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Add a template" className="glass-card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-white/90">Add a template</h2>
            <TemplateForm branchId={branch.id} />
          </section>
        </>
      )}
    </div>
  );
}

function TemplateForm({ branchId, t }: { branchId: string; t?: RotaTemplate }) {
  return (
    <ActionForm action={saveTemplateAction} hidden={{ branch_id: branchId, template_id: t?.id ?? "" }} label={t ? "Save" : "Add template"} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <label className="col-span-2 block">
          <span className="form-label">Name</span>
          <input type="text" name="name" maxLength={80} defaultValue={t?.name ?? ""} placeholder="e.g. Early" required />
        </label>
        <label className="block">
          <span className="form-label">Start</span>
          <input type="time" name="start_time" defaultValue={t?.startTime ?? "07:00"} required />
        </label>
        <label className="block">
          <span className="form-label">Finish</span>
          <input type="time" name="end_time" defaultValue={t?.endTime ?? "14:00"} required />
        </label>
        <label className="block">
          <span className="form-label">Break</span>
          <input type="number" name="break_minutes" min={0} max={240} defaultValue={t?.breakMinutes ?? 30} />
        </label>
        <label className="block">
          <span className="form-label">People</span>
          <input type="number" name="headcount" min={1} max={20} defaultValue={t?.headcount ?? 1} />
        </label>
        <label className="col-span-2 block sm:col-span-6">
          <span className="form-label">Where (optional)</span>
          <input type="text" name="location" maxLength={120} defaultValue={t?.location ?? ""} />
        </label>
      </div>
    </ActionForm>
  );
}
