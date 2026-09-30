"use client";

import { useRouter } from "next/navigation";
import { useBranchWord } from "@/components/branches/branch-word";

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
  const bw = useBranchWord();
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
      <option value="">{bw.all}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
