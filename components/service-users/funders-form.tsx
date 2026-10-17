"use client";

/**
 * Be Care Compliant: the company's funders list (Stage 7b part 1, Phil's popups 2026-10-17).
 * Add a council or health board, rename it, archive it when the company stops working for it,
 * restore it. Archived funders stay on the records that already have them.
 */

import ActionForm from "@/components/action-form";
import { addFunderAction, renameFunderAction, setFunderArchivedAction } from "@/lib/service-users/funder-actions";

export type FunderRow = { id: string; name: string; archivedAt: string | null };

export default function FundersForm({ funders }: { funders: FunderRow[] }) {
  const live = funders.filter((f) => !f.archivedAt);
  const archived = funders.filter((f) => f.archivedAt);

  return (
    <div className="space-y-4">
      <ActionForm action={addFunderAction} label="Add funder" savingLabel="Adding…" savedLabel="Added" inline>
        <label htmlFor="new_funder" className="form-label">New funder</label>
        <input id="new_funder" name="name" maxLength={120} required placeholder="For example, Newport City Council" />
      </ActionForm>

      {funders.length === 0 ? (
        <p className="text-sm text-white/55">
          No funders yet. Add the councils and health boards that pay for your service users&apos; care, then choose one on each service user&apos;s Manage record.
        </p>
      ) : (
        <ul className="space-y-2">
          {/* Keyed on the name and archived state too, so a rename or an archive starts the row's
              buttons afresh rather than carrying the last flash ("Restored" on a just archived row). */}
          {[...live, ...archived].map((f) => (
            <li key={`${f.id}-${f.name}-${f.archivedAt ? "archived" : "live"}`} className={`rounded-xl border border-white/10 px-4 py-3 ${f.archivedAt ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <ActionForm action={renameFunderAction} hidden={{ funder_id: f.id }} label="Save" inline>
                    <label htmlFor={`funder_${f.id}`} className="form-label">
                      Name{f.archivedAt ? <span className="pill pill-neutral ml-2">Archived</span> : null}
                    </label>
                    <input id={`funder_${f.id}`} name="name" maxLength={120} required defaultValue={f.name} />
                  </ActionForm>
                </div>
                <ActionForm
                  action={setFunderArchivedAction}
                  hidden={{ funder_id: f.id, archive: f.archivedAt ? "0" : "1" }}
                  label={f.archivedAt ? "Restore" : "Archive"}
                  savingLabel={f.archivedAt ? "Restoring…" : "Archiving…"}
                  savedLabel={f.archivedAt ? "Restored" : "Archived"}
                  buttonClassName="btn-outline text-xs"
                  confirm={f.archivedAt ? undefined : `Archive ${f.name}? It leaves the Funder list on records; service users who already have it keep it.`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
