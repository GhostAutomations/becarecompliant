"use client";

/**
 * Be Care Compliant — choose where the "Be Care Compliant" folder lives (0437, Phil 2026-10-08:
 * "Let them choose"). A SharePoint site is suggested first: it belongs to the company, keeps
 * working when people leave, and its membership controls who can see service user documents.
 */

import { useActionState, useState } from "react";
import { chooseCloudLocation, findCloudSites } from "@/lib/cloud/actions";
import { IDLE_STATE } from "@/lib/forms";
import type { MsSite } from "@/lib/cloud/microsoft";

export default function LocationChooser() {
  const [kind, setKind] = useState<"sharepoint" | "onedrive">("sharepoint");
  const [search, setSearch] = useState("");
  const [sites, setSites] = useState<MsSite[] | null>(null);
  const [siteId, setSiteId] = useState("");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(chooseCloudLocation, IDLE_STATE);

  async function find() {
    setFinding(true);
    setFindError(null);
    const r = await findCloudSites(search);
    setFinding(false);
    if (!r.ok) {
      setFindError(r.error);
      return;
    }
    setSites(r.sites);
    if (r.sites.length === 1) setSiteId(r.sites[0].id);
  }

  const chosen = sites?.find((s) => s.id === siteId) ?? null;
  const card = (active: boolean) =>
    `rounded-xl border p-3 text-left transition ${active ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="location_kind" value={kind} />
      <input type="hidden" name="site_id" value={kind === "sharepoint" ? siteId : ""} />
      <input type="hidden" name="site_name" value={chosen?.name ?? ""} />

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={card(kind === "sharepoint")} onClick={() => setKind("sharepoint")} aria-pressed={kind === "sharepoint"}>
          <span className="block text-sm font-semibold text-white">A SharePoint site (suggested)</span>
          <span className="block text-xs text-white/50">
            Belongs to the company, keeps working when people leave, and only the site&apos;s members can see it.
          </span>
        </button>
        <button type="button" className={card(kind === "onedrive")} onClick={() => setKind("onedrive")} aria-pressed={kind === "onedrive"}>
          <span className="block text-sm font-semibold text-white">My OneDrive</span>
          <span className="block text-xs text-white/50">
            Simpler, but it sits in your own account. If you leave, copying stops.
          </span>
        </button>
      </div>

      {kind === "sharepoint" ? (
        <div className="space-y-2">
          <label htmlFor="cloud-site-search" className="form-label">
            Find the site
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="cloud-site-search"
              className="min-w-0 flex-1"
              value={search}
              placeholder="Type part of the site name, or leave empty to list them all"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void find();
                }
              }}
            />
            <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={find} disabled={finding}>
              {finding ? "Looking…" : "Find sites"}
            </button>
          </div>
          {findError ? <p className="form-error">{findError}</p> : null}
          {sites ? (
            sites.length === 0 ? (
              <p className="form-hint">No sites found. Try another name, or ask your IT person to add you to the site.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
                {sites.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-start gap-2 rounded-lg p-2 text-sm text-white/85 hover:bg-white/5">
                      <input type="radio" name="site_pick" checked={siteId === s.id} onChange={() => setSiteId(s.id)} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-white">{s.name}</span>
                        <span className="block truncate text-xs text-white/45">{s.webUrl}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-emerald-300">{state.ok}</p> : null}

      <button
        type="submit"
        className="btn-primary px-4 py-2 text-sm"
        disabled={pending || (kind === "sharepoint" && !siteId)}
      >
        {pending ? "Setting up the folder…" : "Use this and make the folder"}
      </button>
    </form>
  );
}
