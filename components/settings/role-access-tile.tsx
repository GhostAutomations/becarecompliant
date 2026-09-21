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
import {
  deleteCompanyRole,
  renameCompanyRole,
  saveCompanyRoleModules,
  saveRoleModules,
} from "@/app/(app)/settings/actions";

export type ModuleTick = {
  key: string;
  label: string;
  note: string | null;
  allowed: boolean;
  locked: boolean;
  on: boolean;
};

/**
 * ONE TILE FOR BOTH KINDS OF ROLE (0314). A built-in role and a company's own role are the same
 * question with the same tick boxes, so they are the same tile: only the action behind Save
 * differs, and a company's own role carries a rename and a delete underneath.
 *
 * The rename and the delete are SIBLINGS of the ticks form, never nested inside it: a form
 * inside a form is invalid HTML and the browser drops the inner one, which would have made
 * Rename quietly save the ticks instead.
 */
export default function RoleAccessTile({
  role,
  roleLabel,
  modules,
  companyRole = null,
}: {
  role: string;
  roleLabel: string;
  modules: ModuleTick[];
  /** Set when this is a role the company made: what it copies, and who is on it. */
  companyRole?: { id: string; baseLabel: string; people: number } | null;
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
      {companyRole ? (
        <p className="mt-1 text-xs text-white/45">
          Starts from {companyRole.baseLabel}, and reaches the same branches.{" "}
          {companyRole.people === 0
            ? "Nobody is on it yet."
            : companyRole.people === 1
              ? "One person is on it."
              : `${companyRole.people} people are on it.`}
        </p>
      ) : null}

      <ActionForm
        action={companyRole ? saveCompanyRoleModules : saveRoleModules}
        hidden={companyRole ? { company_role_id: companyRole.id } : { role }}
        label="Save"
        className="mt-3"
      >
        {/*
          COLUMNS, not a list of sixteen (Phil, 2026-09-17: "those tiles are way to big put 3
          columns of of tick boxes in each tile"). One column made a tile taller than the screen,
          and seven of those meant scrolling past a whole role to reach the next.

          TWO columns inside, not three, now that three TILES share a row: at a third of the page
          a third column leaves about 130px per tick, and "Whistleblowing" and "Service Users"
          truncate to nothing. Sixteen in two columns is eight short rows, which is what makes
          three tiles fit across without either of them being unreadable.

          The REASON moves to the tick's title rather than sitting under it: a note under a label
          in a narrow column wraps to four lines and undoes the columns. It is still there on
          hover and to a screen reader, and the label itself is dimmed, which is what says "not
          for this role" at a glance.

          Two columns on a phone, one below that: three columns of checkboxes at 360px is
          unreadable, and this screen has to work on the phone an owner actually carries.
        */}
        <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
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

      {companyRole ? (
        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
          <ActionForm
            action={renameCompanyRole}
            hidden={{ company_role_id: companyRole.id }}
            label="Rename"
          >
            <label htmlFor={`name-${companyRole.id}`} className="form-label">
              Name
            </label>
            <input
              id={`name-${companyRole.id}`}
              name="name"
              defaultValue={roleLabel}
              maxLength={40}
              required
            />
            {/* WHAT IT COPIES IS NOT EDITABLE, on purpose: changing it would change what
                everybody on the role can reach, from a control that looks like a rename. */}
          </ActionForm>
          <ActionForm
            action={deleteCompanyRole}
            hidden={{ company_role_id: companyRole.id }}
            label="Delete this role"
            buttonClassName="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white"
            confirm="Delete this role? Anyone on it must be moved first, and nothing else changes."
          >
            <p className="text-xs text-white/40">
              A role with people on it cannot be deleted. Move them first.
            </p>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
