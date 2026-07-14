"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Branch picker that lives inside a report View. Changing it reloads the same
 * report for the chosen branch, keeping any date range. The PQS report is always a
 * single branch (local authority monitoring is per contract), so it hides "All".
 */
export default function ReportBranchSelect({
  branches,
  value,
  allowAll,
}: {
  branches: { id: string; name: string }[];
  value: string;
  allowAll: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div>
      <label htmlFor="rbranch" className="form-label">
        Branch
      </label>
      <select
        id="rbranch"
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(Array.from(searchParams.entries()));
          p.set("branch", e.target.value);
          router.replace(`${pathname}?${p.toString()}`);
        }}
        className="max-w-xs"
      >
        {allowAll ? <option value="all">All branches</option> : null}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
