"use client";

/**
 * Be Care Compliant — Founder master template library (Phase 5).
 * Lists the platform starter forms and lets the Founder create a new one, edit it
 * in the same builder, or archive/restore it. Platform admin only (RLS enforced).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTemplate, setTemplateStatus } from "@/lib/form-builder/actions";
import type { Population, TemplateSummary } from "@/lib/form-builder/types";

const POP_LABEL: Record<Population, string> = {
  people: "People",
  service_users: "Service Users",
};

export default function TemplateLibrary({ templates }: { templates: TemplateSummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [population, setPopulation] = useState<Population>("people");
  const [error, setError] = useState<string | null>(null);

  function createIt() {
    setError(null);
    startTransition(async () => {
      const res = await createTemplate({ key, name, population });
      if (res.error) setError(res.error);
      else if (res.redirectTo) router.push(res.redirectTo);
    });
  }

  function toggleStatus(t: TemplateSummary) {
    startTransition(async () => {
      const res = await setTemplateStatus(t.id, t.status === "archived" ? "active" : "archived");
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary px-4 py-2 text-sm"
          >
            New template
          </button>
        ) : null}
      </div>

      {creating && (
        <div className="glass-card max-w-lg space-y-4 p-5">
          <h2 className="text-sm font-semibold text-white">New master template</h2>
          <div>
            <label htmlFor="nt-name" className="form-label">
              Name
            </label>
            <input
              id="nt-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Supervision"
            />
          </div>
          <div>
            <label htmlFor="nt-key" className="form-label">
              Key
            </label>
            <input
              id="nt-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. supervision"
            />
            <p className="form-hint">
              A stable identifier. Companies seed their own copy of this key.
            </p>
          </div>
          <div>
            <label htmlFor="nt-pop" className="form-label">
              Population
            </label>
            <select
              id="nt-pop"
              value={population}
              onChange={(e) => setPopulation(e.target.value as Population)}
            >
              <option value="people">People</option>
              <option value="service_users">Service Users</option>
            </select>
          </div>
          {error && <p className="form-error mt-0">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createIt}
              disabled={pending || key.trim() === ""}
              className="btn-primary px-4 py-2 text-sm"
            >
              {pending ? "Creating…" : "Create and edit"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={pending}
              className="btn-ghost px-3 py-2 text-sm text-white/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          No master templates yet.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="glass-card flex items-center justify-between gap-3 p-4">
              <Link href={`/founder/forms/${t.id}`} className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{t.name}</p>
                <p className="text-xs text-white/45">
                  {POP_LABEL[t.population]} · <span className="font-mono">{t.key}</span> · v{t.version}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`pill ${t.status === "archived" ? "pill-neutral" : "pill-green"}`}>
                  {t.status}
                </span>
                <button
                  type="button"
                  onClick={() => toggleStatus(t)}
                  disabled={pending}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  {t.status === "archived" ? "Restore" : "Archive"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
