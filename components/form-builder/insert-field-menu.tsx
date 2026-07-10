"use client";

/**
 * Be Care Compliant — Form builder: the add/insert field menu.
 * A compact "+" that opens the field-type palette (and, when a question bank is
 * provided, a From question bank tab). Used both between fields (insert at a
 * position) and at the end of a section (append). Canonical controls only.
 */

import { useState } from "react";
import type { FieldType } from "@/lib/form-schema";
import { FIELD_TYPE_META } from "@/lib/form-builder/types";
import type { BankQuestion } from "@/lib/form-builder/types";

export default function InsertFieldMenu({
  onPickType,
  onPickBank,
  bank,
  variant = "line",
  label = "Add field",
}: {
  onPickType: (type: FieldType) => void;
  /** Insert a field built from a question bank entry. */
  onPickBank?: (q: BankQuestion) => void;
  bank?: BankQuestion[];
  /** "line" = a thin insert point between fields; "button" = a normal button. */
  variant?: "line" | "button";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "bank">("new");
  const hasBank = !!bank && bank.length > 0 && !!onPickBank;

  if (!open) {
    if (variant === "line") {
      return (
        <div className="group flex items-center py-1">
          <div className="h-px flex-1 bg-white/10" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-ghost mx-2 px-2 py-0.5 text-xs text-white/50"
            aria-label="Insert a field here"
          >
            + Insert
          </button>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-outline px-4 py-2 text-sm">
        {label}
      </button>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        {hasBank ? (
          <div className="inline-flex rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setTab("new")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                tab === "new" ? "bg-white/15 text-white" : "text-white/60"
              }`}
            >
              New field
            </button>
            <button
              type="button"
              onClick={() => setTab("bank")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                tab === "bank" ? "bg-white/15 text-white" : "text-white/60"
              }`}
            >
              From question bank
            </button>
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Add a field</p>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost px-2 py-1 text-xs text-white/60"
        >
          Close
        </button>
      </div>

      {tab === "new" || !hasBank ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FIELD_TYPE_META.map((m) => (
            <button
              key={m.type}
              type="button"
              onClick={() => {
                onPickType(m.type);
                setOpen(false);
              }}
              className="app-tile items-start p-3 text-left"
            >
              <span className="text-sm font-medium text-white">{m.label}</span>
              <span className="text-[11px] text-white/45">{m.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {bank!.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                onPickBank!(q);
                setOpen(false);
              }}
              className="app-tile flex-row items-center justify-between gap-3 p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{q.label}</span>
                {q.category && <span className="text-[11px] text-white/45">{q.category}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
