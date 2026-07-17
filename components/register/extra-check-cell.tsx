"use client";

/**
 * Be Care Compliant — a custom check's cell in the register matrix (Item 4). Shows the
 * next due date with RAG on top and the last completed date beneath, and (for editors)
 * links to that check instance's Complete route, exactly like the curated check cells.
 */

import Link from "next/link";
import { formatDisplayDate } from "@/lib/people/logic";

/** Minimal status shape shared by People + Service User rows (both carry these). */
export type ExtraCellStatus = {
  instance_id: string;
  due_date: string | null;
  last_completed_on: string | null;
  rag: string;
};

function ragClass(rag: string): string {
  return rag === "red"
    ? "rag-cell-red"
    : rag === "amber"
      ? "rag-cell-amber"
      : rag === "green"
        ? "rag-cell-green"
        : "rag-cell-none";
}

export default function ExtraCheckCell({
  status,
  recordId,
  basePath,
  fromQuery,
  editable,
}: {
  status: ExtraCellStatus | undefined;
  recordId: string;
  basePath: "/people" | "/service-users";
  fromQuery: string;
  editable: boolean;
}) {
  if (!status) return <span className="rag-cell rag-cell-none">—</span>;

  const inner = (
    <span className="inline-flex flex-col items-start leading-tight">
      <span className={`rag-cell ${ragClass(status.rag)}`}>
        {status.due_date ? formatDisplayDate(status.due_date) : "—"}
      </span>
      {status.last_completed_on ? (
        <span className="mt-0.5 text-[10px] text-white/45">Done {formatDisplayDate(status.last_completed_on)}</span>
      ) : null}
    </span>
  );

  if (!editable) return inner;

  return (
    <Link
      href={`${basePath}/${recordId}/checks/${status.instance_id}/complete${fromQuery}`}
      className="transition hover:opacity-80"
    >
      {inner}
    </Link>
  );
}
