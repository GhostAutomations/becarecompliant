"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Branch = { id: string; name: string };
type ServiceUser = { id: string; name: string; branch_id: string };
export type ClientInitial = {
  id?: string;
  client_type?: "person" | "organisation";
  name?: string;
  branch_id?: string;
  branch_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  service_user_id?: string | null;
  payment_terms_days?: number | null;
  notes?: string | null;
};

export default function PrivateClientForm({
  action,
  mode,
  branches,
  serviceUsers,
  initial,
}: {
  action: ServerAction;
  mode: "create" | "edit";
  branches: Branch[];
  serviceUsers: ServiceUser[];
  initial?: ClientInitial;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [type, setType] = useState<"person" | "organisation">(initial?.client_type ?? "person");
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [branchId, setBranchId] = useState<string>(
    initial?.branch_id ?? (branches.length === 1 ? branches[0].id : ""),
  );
  const [linkedSU, setLinkedSU] = useState<string>(initial?.service_user_id ?? "");

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  const branchSUs = serviceUsers.filter((s) => s.branch_id === branchId);

  // "Start from a Service User": fill name, branch and link in one step (the
  // common self-funder case where the client is the person receiving care).
  function startFromServiceUser(id: string) {
    if (!id) return;
    const su = serviceUsers.find((s) => s.id === id);
    if (!su) return;
    setType("person");
    setName(su.name);
    setBranchId(su.branch_id);
    setLinkedSU(su.id);
  }

  function onBranchChange(id: string) {
    setBranchId(id);
    // Drop the linked service user if it no longer belongs to the chosen branch.
    if (linkedSU && !serviceUsers.some((s) => s.id === linkedSU && s.branch_id === id)) {
      setLinkedSU("");
    }
  }

  return (
    <form action={formAction} className="glass-card space-y-4 p-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      {mode === "create" && serviceUsers.length > 0 ? (
        <div className="rounded-lg border border-gold-400/20 bg-gold-400/5 p-3">
          <label htmlFor="from_su" className="form-label">Start from a Service User (optional)</label>
          <select
            id="from_su"
            defaultValue=""
            onChange={(e) => startFromServiceUser(e.target.value)}
          >
            <option value="">Choose a service user to copy their name and branch</option>
            {serviceUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="form-hint">
            For a self funding client who is the person receiving care. Fills the name, branch and link
            below, which you can still edit.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="client_type" className="form-label">Client type</label>
        <select
          id="client_type"
          name="client_type"
          value={type}
          onChange={(e) => setType(e.target.value as "person" | "organisation")}
          className="max-w-[16rem]"
        >
          <option value="person">Person</option>
          <option value="organisation">Organisation</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="form-label">
            {type === "organisation" ? "Organisation name" : "Full name"}
          </label>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {mode === "create" ? (
          <div>
            <label htmlFor="branch_id" className="form-label">Branch</label>
            <select
              id="branch_id"
              name="branch_id"
              value={branchId}
              onChange={(e) => onBranchChange(e.target.value)}
              required
            >
              <option value="">Choose a branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="form-label">Branch</label>
            <p className="pt-2 text-sm text-white/70">{initial?.branch_name ?? "—"}</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact_name" className="form-label">
            {type === "organisation" ? "Contact name" : "Contact name (optional)"}
          </label>
          <input id="contact_name" name="contact_name" defaultValue={initial?.contact_name ?? ""} />
        </div>
        <div>
          <label htmlFor="email" className="form-label">Email</label>
          <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
        </div>
        <div>
          <label htmlFor="phone" className="form-label">Phone</label>
          <input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
        </div>
        <div>
          <label htmlFor="payment_terms_days" className="form-label">Payment terms (days, optional)</label>
          <input
            id="payment_terms_days"
            name="payment_terms_days"
            type="number"
            min={0}
            defaultValue={initial?.payment_terms_days ?? ""}
            placeholder="Company default"
            className="max-w-[10rem]"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="address_line1" className="form-label">Address line 1</label>
          <input id="address_line1" name="address_line1" defaultValue={initial?.address_line1 ?? ""} />
        </div>
        <div>
          <label htmlFor="address_line2" className="form-label">Address line 2</label>
          <input id="address_line2" name="address_line2" defaultValue={initial?.address_line2 ?? ""} />
        </div>
        <div>
          <label htmlFor="city" className="form-label">Town / city</label>
          <input id="city" name="city" defaultValue={initial?.city ?? ""} />
        </div>
        <div>
          <label htmlFor="postcode" className="form-label">Postcode</label>
          <input id="postcode" name="postcode" defaultValue={initial?.postcode ?? ""} className="max-w-[10rem]" />
        </div>
      </div>

      <div>
        <label htmlFor="service_user_id" className="form-label">Linked Service User (optional)</label>
        <select
          id="service_user_id"
          name="service_user_id"
          value={linkedSU}
          onChange={(e) => setLinkedSU(e.target.value)}
        >
          <option value="">Not linked</option>
          {branchSUs.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <p className="form-hint">The person receiving the care this client pays for, in the chosen branch.</p>
      </div>

      <div>
        <label htmlFor="notes" className="form-label">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Saving…" : mode === "create" ? "Add client" : "Save"}
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">{state.ok}</span> : null}
        {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
