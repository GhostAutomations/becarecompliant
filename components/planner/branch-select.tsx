"use client";

import { useRouter } from "next/navigation";

/** Header branch selector for the Whiteboard board. Navigates to the same page
 *  with ?branch=, so the board re-renders filtered to that branch. */
export default function BranchSelect({
  branches,
  value,
  basePath,
}: {
  branches: Array<{ id: string; name: string }>;
  value: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      className="inline-cell"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `${basePath}?branch=${v}` : basePath);
      }}
    >
      <option value="">All branches</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
