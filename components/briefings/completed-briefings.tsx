"use client";

/**
 * Be Care Compliant — what has come back, grouped by what was sent.
 *
 * Phil, 2026-07-27: "if some sends 1o polices to 50 people we dont want 500
 * completed". Quite. A completed list one row per person answers the wrong
 * question anyway: a manager wants "where is the medication policy up to", not a
 * stream of 500 identical lines.
 *
 * So one row per policy or form, newest first, collapsed by default, each with
 * the live "who has signed" report behind it.
 */

import { useState } from "react";
import type { AssignmentRow } from "@/lib/assignments/types";

type Group = {
  key: string;
  kind: "policy" | "form";
  targetId: string | null;
  title: string;
  version: number | null;
  count: number;
  latest: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default function CompletedBriefings({ completed }: { completed: AssignmentRow[] }) {
  const [open, setOpen] = useState(false);

  const byThing = new Map<string, Group>();
  for (const a of completed) {
    const targetId = a.kind === "policy" ? a.policy_id : a.form_id;
    // Version is part of the key on purpose: signing v1 and signing v2 are two
    // different things to have done, and an inspector cares which.
    const key = `${a.kind}:${targetId ?? a.title}:${a.policy_version ?? ""}`;
    const found = byThing.get(key);
    if (found) {
      found.count += 1;
      if ((a.completed_at ?? "") > (found.latest ?? "")) found.latest = a.completed_at;
    } else {
      byThing.set(key, {
        key,
        kind: a.kind,
        targetId,
        title: a.title,
        version: a.policy_version,
        count: 1,
        latest: a.completed_at,
      });
    }
  }
  const groups = [...byThing.values()].sort((a, b) =>
    (b.latest ?? "").localeCompare(a.latest ?? ""),
  );

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Completed ({completed.length})
        </h2>
        <span
          aria-hidden
          className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open ? (
        groups.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/60">Nothing completed yet.</div>
        ) : (
          <div className="glass-card divide-y divide-white/10">
            {groups.map((g) => (
              <div key={g.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{g.title}</p>
                  <p className="text-xs text-white/45">
                    {g.count} {g.count === 1 ? "person" : "people"}
                    {g.kind === "policy" ? " signed" : " completed"}
                    {g.version ? ` · version ${g.version}` : ""}
                    {g.latest ? ` · latest ${fmt(g.latest)}` : ""}
                  </p>
                </div>
                {g.targetId ? (
                  <a
                    href={`/api/briefings/report?${g.kind === "policy" ? "policy" : "form"}=${g.targetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline px-3 py-2 text-xs"
                  >
                    Who has signed
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
