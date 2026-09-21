"use client";

/**
 * Make a role of your own (Phil, 2026-09-21: "lets add the roles to users and access").
 *
 * TWO FIELDS, and the second is the important one. A name, and the built-in role it starts from
 * — which is where its branch reach and everything it may do comes from. The sentence under the
 * picker says so in words, because "starts from Supervisor" is the whole contract: the new role
 * can have LESS than a Supervisor and never more, and somebody making "Care Coordinator" needs
 * to know that before they choose, not after they wonder why a tick is greyed out.
 *
 * The departments are NOT chosen here. A new role starts with everything its base role has, and
 * the tile that appears afterwards is where boxes come off — the same tile, with the same ticks,
 * as every built-in role, so there is one way to answer the question and not two.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { createCompanyRole } from "@/app/(app)/settings/actions";

export type CopyableRole = { value: string; label: string; reach: string };

export default function NewRoleForm({ roles }: { roles: CopyableRole[] }) {
  const [base, setBase] = useState(roles[0]?.value ?? "");
  const chosen = roles.find((r) => r.value === base) ?? null;

  return (
    <ActionForm action={createCompanyRole} label="Create role" className="max-w-xl space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new_role_name" className="form-label">
            What is it called
          </label>
          <input
            id="new_role_name"
            name="name"
            placeholder="Care Coordinator"
            maxLength={40}
            required
          />
        </div>
        <div>
          <label htmlFor="new_role_base" className="form-label">
            Which role it starts from
          </label>
          <select
            id="new_role_base"
            name="base_role"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {chosen ? (
        <p className="text-xs text-white/50">
          It will reach {chosen.reach} It starts with everything a {chosen.label} has, and you
          then untick what it must not open. A role can never reach further than the one it
          starts from.
        </p>
      ) : null}
    </ActionForm>
  );
}
