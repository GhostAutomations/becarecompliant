"use client";

import Link from "next/link";
import { useState } from "react";
import ShiftForm from "./shift-form";
import { fmtRange } from "@/lib/on-call/format";
import type { BranchOption, OnCallShift, PersonOption } from "@/lib/on-call/types";

export default function RotaView({
  current,
  upcoming,
  branches,
  people,
  openFollowUps,
  canManage,
}: {
  current: OnCallShift[];
  upcoming: OnCallShift[];
  branches: BranchOption[];
  people: PersonOption[];
  openFollowUps: number;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">On Call</h1>
          <p className="text-sm text-white/60">Who is on call, and the log of out-of-hours calls.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/on-call/log" className="btn-ghost text-sm">
            Call log
            {openFollowUps > 0 ? (
              <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200">
                {openFollowUps} to follow up
              </span>
            ) : null}
          </Link>
          {canManage ? (
            <button type="button" className="btn-primary text-sm" onClick={() => { setAdding((v) => !v); setEditingId(null); }}>
              {adding ? "Close" : "Add shift"}
            </button>
          ) : null}
        </div>
      </div>

      {/* On call now */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-white/80">On call now</h2>
        {current.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/50">No one is currently marked on call.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {current.map((s) => (
              <div key={s.id} className="glass-card border-l-2 border-gold-400/70 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold text-white">{s.on_call_person_name ?? "Unassigned"}</span>
                  {s.phone ? <a href={`tel:${s.phone}`} className="text-sm font-medium text-gold-300">{s.phone}</a> : null}
                </div>
                <p className="mt-1 text-xs text-white/60">{s.branch_name}</p>
                <p className="mt-1 text-xs text-white/50">Until {fmtRange(s.starts_at, s.ends_at).split(" to ").slice(-1)[0]}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {adding && canManage ? (
        <ShiftForm branches={branches} people={people} onDone={() => setAdding(false)} />
      ) : null}

      {/* Upcoming rota */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-white/80">Rota</h2>
        {upcoming.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-white/50">
            No shifts on the rota yet.{canManage ? " Add the first one above." : ""}
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) =>
              editingId === s.id && canManage ? (
                <li key={s.id}>
                  <ShiftForm branches={branches} people={people} shift={s} onDone={() => setEditingId(null)} />
                </li>
              ) : (
                <li key={s.id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{s.on_call_person_name ?? "Unassigned"}</span>
                      {s.phone ? <span className="text-xs text-white/50">· {s.phone}</span> : null}
                    </div>
                    <p className="text-sm text-white/70">{fmtRange(s.starts_at, s.ends_at)}</p>
                    <p className="text-xs text-white/45">{s.branch_name}{s.notes ? ` · ${s.notes}` : ""}</p>
                  </div>
                  {canManage ? (
                    <button type="button" className="btn-ghost text-xs" onClick={() => { setEditingId(s.id); setAdding(false); }}>
                      Edit
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
