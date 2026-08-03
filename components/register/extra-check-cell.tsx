"use client";

/**
 * Be Care Compliant — a custom check's cell in the register matrix (Item 6).
 *
 * The COLOUR always comes from the check, so a cell means the same thing however it is labelled.
 * The TEXT is the check's next due date by default, or the latest answer to a question on its
 * form when an Admin has pointed the column at one. Editors click through to Complete.
 */

import Link from "next/link";
import { formatDisplayDate } from "@/lib/people/logic";

/** Minimal status shape shared by People + Service User rows (both carry these). */
export type ExtraCellStatus = {
  instance_id: string;
  due_date: string | null;
  last_completed_on: string | null;
  last_evidence_id?: string | null;
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
  text,
}: {
  status: ExtraCellStatus | undefined;
  recordId: string;
  basePath: "/people" | "/service-users";
  fromQuery: string;
  editable: boolean;
  /** Set when the column is pointed at a question. An empty string means nothing recorded yet. */
  text?: string;
}) {
  if (!status) return <span className="rag-cell rag-cell-none">—</span>;

  const shown =
    text === undefined
      ? status.due_date
        ? formatDisplayDate(status.due_date)
        : ""
      : text;

  const inner = (
    <span className={`rag-cell ${ragClass(status.rag)}`} title={shown || undefined}>
      {shown || "—"}
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
