import "server-only";

/**
 * Be Care Compliant — build the Regulation 80 quality of care review as a branded
 * ReportDoc, so it renders through the shared export PDF engine (one PDF pipeline for
 * all reports). AI narrative prints in the normal black body; uploaded images (survey
 * chart, call duration table) and the drawn signature embed as image blocks. No dashes.
 */

import { REG80_SECTIONS } from "@/lib/reg80/spec";
import type { ReportDoc, ReportBlock } from "@/lib/export/pdf";
import type { Reg80ReviewFull } from "@/lib/reg80/data";

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

export function buildReg80Doc(review: Reg80ReviewFull, branchName: string, companyName: string): ReportDoc {
  const data = review.data ?? {};
  const val = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");

  const blocks: ReportBlock[] = [];
  for (const section of REG80_SECTIONS) {
    blocks.push({ kind: "heading", text: section.title });
    if (section.intro) blocks.push({ kind: "paragraph", text: section.intro });
    for (const field of section.fields) {
      if (field.type === "signature") {
        const sig = val(field.key);
        if (sig.startsWith("data:image")) {
          blocks.push({ kind: "image", dataUrl: sig, width: 220, height: 64, caption: field.label });
        } else {
          const note = val("sign_method") === "printed" ? "To be signed on the printed version" : "Not signed";
          blocks.push({ kind: "paragraph", text: `${field.label}\n${note}` });
        }
        continue;
      }
      if (field.type === "image") {
        const img = val(field.key);
        if (img.startsWith("data:image")) {
          blocks.push({ kind: "image", dataUrl: img, width: 460, caption: field.label });
        }
        // An empty optional image is simply omitted.
        continue;
      }
      let value: string;
      if (field.type === "date") value = fmtDate(val(field.key));
      else value = val(field.key).trim() || "Not answered";
      blocks.push({ kind: "paragraph", text: `${field.label}\n${value}` });
    }
  }

  const signedLine =
    review.status === "submitted"
      ? `Signed by ${review.ri_name ?? "the Responsible Individual"}${
          review.submitted_at ? ` on ${fmtDateTime(review.submitted_at)}` : ""
        }. A signature was captured on submission.`
      : "Draft, not yet submitted or signed.";

  return {
    title: "Quality of Care Review, Regulation 80",
    subtitle: `${companyName}, ${branchName}`,
    reference: review.reference ?? undefined,
    meta: [
      { label: "Responsible Individual", value: review.ri_name ?? "Not set" },
      { label: "Branch", value: branchName },
      { label: "Review period", value: `${fmtDate(review.period_start)} to ${fmtDate(review.period_end)}` },
      { label: "Status", value: review.status === "submitted" ? "Submitted" : "Draft" },
    ],
    footerNote: signedLine,
    blocks,
  };
}
