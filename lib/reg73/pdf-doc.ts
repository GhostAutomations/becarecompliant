import "server-only";

/**
 * Be Care Compliant — build the Regulation 73 visit as a branded ReportDoc, so it
 * renders through the shared export PDF engine (one PDF pipeline for all reports).
 * The drawn signature is confirmed in text in the sign off block; the image itself
 * is shown on screen in the visit view. No dashes in copy.
 */

import { REG73_SECTIONS } from "@/lib/reg73/spec";
import type { ReportDoc, ReportBlock } from "@/lib/export/pdf";
import type { Reg73VisitFull } from "@/lib/reg73/data";

function fmtDate(v: string | null | undefined): string {
  if (!v) return "Not set";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : v;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function buildReg73Doc(visit: Reg73VisitFull, branchName: string, companyName: string): ReportDoc {
  const data = visit.data ?? {};
  const val = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");

  const blocks: ReportBlock[] = [];
  for (const section of REG73_SECTIONS) {
    if (section.title === "Sign off") continue; // handled in the footer confirmation
    blocks.push({ kind: "heading", text: section.title });
    for (const field of section.fields) {
      let value: string;
      if (field.type === "date") value = fmtDate(val(field.key));
      else value = val(field.key).trim() || "Not answered";
      blocks.push({ kind: "paragraph", text: `${field.label}\n${value}` });
    }
  }

  const signedLine =
    visit.status === "submitted"
      ? `Signed by ${visit.ri_name ?? "the Responsible Individual"}${
          visit.submitted_at ? ` on ${fmtDateTime(visit.submitted_at)}` : ""
        }. A signature was captured on submission.`
      : "Draft, not yet submitted or signed.";

  return {
    title: "Responsible Individual Branch Visit",
    subtitle: `${companyName}, ${branchName}`,
    reference: visit.reference ?? undefined,
    meta: [
      { label: "Responsible Individual", value: visit.ri_name ?? "Not set" },
      { label: "Branch", value: branchName },
      { label: "Visit dates", value: `${fmtDate(visit.start_date)} to ${fmtDate(visit.end_date)}` },
      { label: "Status", value: visit.status === "submitted" ? "Submitted" : "Draft" },
    ],
    footerNote: signedLine,
    blocks,
  };
}
