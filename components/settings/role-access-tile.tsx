"use client";

/**
 * One role's departments, as a tile of tick boxes.
 *
 * Phil, 2026-09-17: "that role gets a tiles with call departments / views, if they are ticked,
 * that role gets access to it."
 *
 * A GREYED TICK SAYS WHY. A box this role can never have is shown, disabled, with the reason
 * beside it, rather than hidden. Hiding it makes the screen look like it forgot the department;
 * showing it without a reason makes the screen look broken. The reason is the product's, and it
 * is the thing that stops an Admin trying the same tick three times.
 *
 * ONLY WHAT IS ON IS POSTED, which is simply how a browser sends checkboxes: unticked boxes send
 * nothing. The action subtracts what arrives from the ceiling to work out what to switch off, so
 * a dropped field can only switch a department OFF, never quietly on.
 *
 * A LOCKED BOX is ticked, disabled, and posted by a hidden input, so a save cannot drop it: an
 * Admin who unticked their own Settings would have no way back into any setting, including this
 * one.
 */

import ActionForm from "@/components/action-form";
import { saveRoleModules } from "@/app/(app)/settings/actions";

export type ModuleTick = {
  key: string;
  label: string;
  note: string | null;
  allowed: boolean;
  locked: boolean;
  on: boolean;
};

export default function RoleAccessTile({
  role,
  roleLabel,
  modules,
}: {
  role: string;
  roleLabel: string;
  modules: ModuleTick[];
}) {
  const offered = modules.filter((m) => m.allowed).length;

  return (
    <div className="glass-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-white">{roleLabel}</h2>
        <span className="text-xs text-white/40">
          {offered} {offered === 1 ? "department" : "departments"} available
        </span>
      </div>

      <ActionForm
        action={saveRoleModules}
        hidden={{ role }}
        label="Save"
        className="mt-3 space-y-1"
      >
        {modules.map((m) => (
          <label
            key={m.key}
            className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
              m.allowed ? "cursor-pointer text-white/80 hover:bg-white/5" : "text-white/30"
            }`}
          >
            <input
              type="checkbox"
              name="modules"
              value={m.key}
              defaultChecked={m.on || m.locked}
              disabled={!m.allowed || m.locked}
              className="mt-0.5 shrink-0"
            />
            {/* A disabled checkbox is not posted, so a locked one carries its own value. */}
            {m.locked ? <input type="hidden" name="modules" value={m.key} /> : null}
            <span className="min-w-0">
              <span className={m.allowed ? "text-white/85" : ""}>{m.label}</span>
              {m.locked ? <span className="ml-2 text-xs text-white/40">always on</span> : null}
              {!m.allowed || m.locked ? (
                m.note ? (
                  <span className="block text-xs text-white/35">{m.note}</span>
                ) : !m.allowed ? (
                  <span className="block text-xs text-white/35">
                    Not available to the {roleLabel} role.
                  </span>
                ) : null
              ) : null}
            </span>
          </label>
        ))}
      </ActionForm>
    </div>
  );
}
