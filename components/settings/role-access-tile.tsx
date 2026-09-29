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

import { useEffect, useRef, useState } from "react";
import ActionForm from "@/components/action-form";
import { SENIOR_CHECK_FIELD, splitColumns } from "@/lib/senior/checks";
import {
  deleteCompanyRole,
  renameCompanyRole,
  saveCompanyRoleModules,
  saveRoleModules,
} from "@/app/(app)/settings/actions";

/** A Check box under a department, on the Senior tile only (0339). */
export type CheckTick = { id: string; name: string; on: boolean };

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
  checksUnder,
}: {
  role: string;
  roleLabel: string;
  modules: ModuleTick[];
  /** The Senior tile's Check boxes, keyed by the department they sit under (0339). */
  checksUnder?: Partial<Record<string, CheckTick[]>>;
  /** Set when this is a role the company made: what it copies, and who is on it. */
  companyRole?: { id: string; baseLabel: string; people: number } | null;
}) {
  const offered = modules.filter((m) => m.allowed).length;

  /* THE CHECK BOXES (Senior only). Phil, 2026-09-29: "if people and service users [are] ticked,
     then [the] boxes underneath should be active and ticked". So the department's tick is
     controlled here: ticking it turns every Check under it on, unticking it greys them. A greyed
     box is not posted, and the action leaves that list's Checks as they were (lib/senior/checks). */
  const [deptOn, setDeptOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(modules.map((m) => [m.key, m.on || m.locked])),
  );
  const [checkOn, setCheckOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.values(checksUnder ?? {}).flatMap((list) => (list ?? []).map((c) => [c.id, c.on])),
    ),
  );
  /* AFTER SAVE, REACT RESETS THE FORM (a form action resets its form when it succeeds), which
     would put every box back to how it was when the page first drew while the ticks above still
     hold what was saved. Found testing 2026-09-29: first the boxes stayed wrong (Health Check
     showed ticked though saved off), then, redrawn a moment later, they flashed all ticked
     before settling (Phil: "that shouldn't happen"). The browser announces a reset before doing
     it and lets it be cancelled, so the Senior tile cancels it: every box on it is driven by the
     ticks above, which already are what was saved, and nothing ever flashes. */
  const boxesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!checksUnder) return;
    const form = boxesRef.current?.closest("form");
    if (!form) return;
    const keepTicks = (e: Event) => e.preventDefault();
    form.addEventListener("reset", keepTicks);
    return () => form.removeEventListener("reset", keepTicks);
  }, [checksUnder]);

  const toggleDept = (key: string, on: boolean) => {
    setDeptOn((d) => ({ ...d, [key]: on }));
    const under = checksUnder?.[key];
    if (on && under && under.length > 0) {
      setCheckOn((c) => ({ ...c, ...Object.fromEntries(under.map((x) => [x.id, true])) }));
    }
  };

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
        {/* THE SENIOR TILE (Phil, 2026-09-29): each list across the tile, one under the other with
            a dashed line between. Its Checks sit beneath it, each row the height of a department row: a
            long list in three columns filled down the left first (People: four, three, three, so
            the tile is the height of the Viewer tile), a short one in the left column (Service
            users). */}
        <div
          ref={boxesRef}
          className={checksUnder ? "" : "grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2"}
        >
          {modules.map((m, index) => {
            const under = checksUnder?.[m.key];
            const parentLive = m.allowed && !m.locked;
            const why = !m.allowed
              ? m.note ?? `Not available to the ${roleLabel} role.`
              : m.locked
                ? m.note ?? "Always on."
                : undefined;
            const label = (
              <label
                key={m.key}
                title={why}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] ${
                  m.allowed && !m.locked
                    ? "cursor-pointer text-white/80 hover:bg-white/5"
                    : "text-white/30"
                }`}
              >
                {under ? (
                  <input
                    type="checkbox"
                    name="modules"
                    value={m.key}
                    checked={!!deptOn[m.key]}
                    onChange={(e) => toggleDept(m.key, e.target.checked)}
                    disabled={!parentLive}
                    className="shrink-0"
                  />
                ) : (
                  <input
                    type="checkbox"
                    name="modules"
                    value={m.key}
                    defaultChecked={m.on || m.locked}
                    disabled={!m.allowed || m.locked}
                    className="shrink-0"
                  />
                )}
                {/* A disabled checkbox is not posted, so a locked one carries its own value. */}
                {m.locked ? <input type="hidden" name="modules" value={m.key} /> : null}
                <span className="min-w-0 truncate">{m.label}</span>
              </label>
            );
            if (!under) return label;
            const live = parentLive && !!deptOn[m.key];
            return (
              <div
                key={m.key}
                className={index > 0 ? "mt-0.5 border-t border-dashed border-white/20 pt-[3px]" : undefined}
              >
                {label}
                {/* The Checks under this list, indented beneath it. Greyed while the list is
                    unticked; a greyed box is not posted and changes nothing. */}
                {under.length === 0 ? (
                  <p className="ml-6 pb-1 text-xs text-white/40">No checks set up yet.</p>
                ) : (
                  <div className="ml-4 grid grid-cols-3 items-start gap-x-2" aria-label={`${m.label} checks`}>
                    {splitColumns(under).map((column, ci) => (
                      <div key={ci} className="flex flex-col gap-y-0.5">
                        {column.map((c) => (
                          <label
                            key={c.id}
                            title={live ? c.name : `Tick ${m.label} first.`}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] ${
                              live ? "cursor-pointer text-white/75 hover:bg-white/5" : "text-white/30"
                            }`}
                          >
                            <input
                              type="checkbox"
                              name={SENIOR_CHECK_FIELD}
                              value={c.id}
                              checked={!!checkOn[c.id]}
                              onChange={(e) => setCheckOn((x) => ({ ...x, [c.id]: e.target.checked }))}
                              disabled={!live}
                              className="shrink-0"
                            />
                            <span className="min-w-0 truncate">{c.name}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
