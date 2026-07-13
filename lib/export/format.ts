import "server-only";

/**
 * Be Care Compliant — shared formatting for exports (Phase 8).
 * Europe/London dates and the canonical RAG labels, used by every report and
 * CSV so wording is identical across PDF and CSV. No dashes in any copy.
 */

import type { Rag } from "@/lib/recurrence";
import type { RagTone } from "@/lib/export/pdf";

/** "11 July 2026" in Europe/London from an ISO date or Date. Empty for null. */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length <= 10 ? `${value}T12:00:00Z` : value) : value;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "11 July 2026, 14:32" in Europe/London. Used for audit and generated at stamps. */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** The instant a report was generated, ready for a meta pair. */
export function generatedAt(): string {
  return fmtDateTime(new Date());
}

/** Inspector-facing RAG wording (no dashes). */
export function ragLabel(rag: Rag): string {
  if (rag === "red") return "Overdue";
  if (rag === "amber") return "Due soon";
  return "Compliant";
}

/** Rag maps straight onto a report chip tone. */
export function ragTone(rag: Rag): RagTone {
  return rag;
}
