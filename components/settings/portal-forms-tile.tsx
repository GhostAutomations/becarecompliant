"use client";

/**
 * The Team Member tile: what a carer may fill in from their own portal.
 *
 * Phil, 2026-09-17: "For Team Member instead of access to departments it should be controlling
 * access to forms as that is all they can see."
 *
 * TWO KINDS OF GREY, and they must not read as the same thing:
 *   "always on"  — built, working, and not switchable. Nothing today.
 *   "not yet"    — asked for, not built. Reporting an incident.
 * A single grey would have an Admin ticking the second one and waiting for something to happen.
 *
 * And a third state that is not grey at all: a normal tick carrying an amber line, for one whose
 * cost is not obvious from its label. Raising a concern is the only one, since Phil asked for it
 * selectable: the tile says what unticking it removes rather than refusing to let him.
 *
 * The Team Portal tick at the top is the whole area: untick it and the carer has no portal at
 * all, whatever the forms below say. It is kept from the department tile it came from, because
 * switching the portal off in one go is what a company with logins created but not yet handed out
 * actually needs.
 */

import ActionForm from "@/components/action-form";
import { savePortalForms } from "@/app/(app)/settings/actions";
import type { PortalForm } from "@/lib/auth/portal-forms";

export default function PortalFormsTile({
  forms,
  onByKey,
  portalOn,
}: {
  forms: readonly PortalForm[];
  onByKey: Record<string, boolean>;
  portalOn: boolean;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Team Member</h2>
        <span className="text-xs text-white/40">what a carer can fill in</span>
      </div>

      <ActionForm action={savePortalForms} label="Save" className="mt-3">
        {/* THE WHOLE AREA. Untick it and there is no portal at all, whatever the forms below say.
            A company with logins created but not yet handed out needs that in one tick. */}
        <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[13px] text-white/80">
          <input
            type="checkbox"
            name="portal"
            value="on"
            defaultChecked={portalOn}
            className="mt-0.5 shrink-0"
          />
          <span className="min-w-0">
            <span className="font-semibold text-white/90">Team Portal</span>
            <span className="block text-xs text-white/45">
              The whole area. Unticked, a Team Member login opens nothing.
            </span>
          </span>
        </label>
        <div className="space-y-0.5">
          {forms.map((f) => {
            const why = f.locked || !f.available ? f.note : undefined;
            /* A tick that is switchable but costly says so, in amber, under the label. Raising a
               concern is the only one today: it is a normal tick, and unticking it leaves a carer
               no route except through their own manager. */
            const caution = !f.locked && f.available ? f.note : undefined;
            return (
              <label
                key={f.key}
                title={why}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
                  f.available && !f.locked
                    ? "cursor-pointer text-white/80 hover:bg-white/5"
                    : "text-white/35"
                }`}
              >
                <input
                  type="checkbox"
                  name="forms"
                  value={f.key}
                  defaultChecked={f.locked || (f.available && onByKey[f.key] !== false)}
                  disabled={f.locked || !f.available}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-white/85">{f.label}</span>
                  {f.locked ? (
                    <span className="ml-2 text-xs text-emerald-300/70">always on</span>
                  ) : !f.available ? (
                    <span className="ml-2 text-xs text-white/40">not yet</span>
                  ) : null}
                  <span className="block text-xs text-white/45">{why ?? f.hint}</span>
                  {caution ? (
                    <span className="block text-xs text-rag-amber-soft/80">{caution}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </ActionForm>
    </div>
  );
}
