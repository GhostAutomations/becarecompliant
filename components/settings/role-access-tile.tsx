"use client";

/**
 * One role's departments, as a tile of tick boxes.
 *
 * Phil, 2026-09-17: "that role gets a tiles with call departments / views, if they are ticked,
 * that role gets access to it."
 *
 * A GREYED TICK SAYS WHY. A box this role can never have is shown, disabled, and dimmed rather
 * than hidden: hiding it makes the screen look like it forgot the department. The reason is on
 * the tick itself (title, so hover and screen readers both get it) rather than printed under the
 * label, because a note under a label in a three column grid wraps to four lines and undoes the
 * columns it sits in.
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
        className="mt-3"
      >
        {/*
          THREE COLUMNS (Phil, 2026-09-17: "those tiles are way to big put 3 columns of of tick
          boxes in each tile"). Sixteen departments in one column made a tile taller than the
          screen, and seven of those on a page meant scrolling past a role to reach the next.

          The REASON moves to the tick's title rather than sitting under it: a note under a label
          in a narrow column wraps to four lines and undoes the columns. It is still there on
          hover and to a screen reader, and the label itself is dimmed, which is what says "not
          for this role" at a glance.

          Two columns on a phone, one below that: three columns of checkboxes at 360px is
          unreadable, and this screen has to work on the phone an owner actually carries.
        */}
        <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const why = !m.allowed
              ? m.note ?? `Not available to the ${roleLabel} role.`
              : m.locked
                ? m.note ?? "Always on."
                : undefined;
            return (
              <label
                key={m.key}
                title={why}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] ${
                  m.allowed && !m.locked
                    ? "cursor-pointer text-white/80 hover:bg-white/5"
                    : "text-white/30"
                }`}
              >
                <input
                  type="checkbox"
                  name="modules"
                  value={m.key}
                  defaultChecked={m.on || m.locked}
                  disabled={!m.allowed || m.locked}
                  className="shrink-0"
                />
                {/* A disabled checkbox is not posted, so a locked one carries its own value. */}
                {m.locked ? <input type="hidden" name="modules" value={m.key} /> : null}
                <span className="min-w-0 truncate">{m.label}</span>
              </label>
            );
          })}
        </div>
      </ActionForm>
    </div>
  );
}
