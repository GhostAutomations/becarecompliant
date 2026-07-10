"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBranchServiceUserType } from "@/lib/service-users/actions";
import type { BranchType } from "@/lib/service-users/data";

const TYPES: Array<{ value: "simple" | "complex"; label: string }> = [
  { value: "simple", label: "Simple" },
  { value: "complex", label: "Complex" },
];

export default function BranchTypeForm({ branches }: { branches: BranchType[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  function choose(branchId: string, type: "simple" | "complex") {
    setOptimistic((o) => ({ ...o, [branchId]: type }));
    const fd = new FormData();
    fd.set("branch_id", branchId);
    fd.set("type", type);
    startTransition(async () => {
      await setBranchServiceUserType(fd);
      router.refresh();
    });
  }

  if (branches.length === 0) {
    return <p className="text-sm text-white/60">No branches yet. Add a branch to set its type.</p>;
  }

  return (
    <div className="space-y-2">
      {branches.map((b) => {
        const current = optimistic[b.id] ?? b.service_user_type;
        return (
          <div
            key={b.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3"
          >
            <span className="text-sm font-medium text-white/85">{b.name}</span>
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={pending}
                  onClick={() => choose(b.id, t.value)}
                  className={`${current === t.value ? "btn-primary" : "btn-outline"} text-xs`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
