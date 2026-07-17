import "server-only";

/**
 * Branded "import needs attention" email. Sent to Company Admins after a bulk
 * import when the system flagged anything: duplicates it skipped, rows it could
 * not add, or checks it recorded but could not give a next due (e.g. appraisals
 * scheduled off the supervision cycle). Branded shell + CTA button, no dashes.
 */

import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { siteUrl } from "@/lib/site";
import type { ImportFlags } from "./commit";

function listBlock(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  const items = lines.map((l) => `<li style="margin:2px 0;">${l}</li>`).join("");
  return `<p style="margin:16px 0 4px 0;font-weight:700;color:#ffffff;">${escapeHtml(title)}</p>
    <ul style="margin:0;padding-left:18px;color:#e8ecf6;font-size:13px;line-height:1.6;">${items}</ul>`;
}

export function importSummaryEmail(opts: {
  companyName: string;
  population: "people" | "service_users";
  created: number;
  flags: ImportFlags;
}): { subject: string; html: string } {
  const noun = opts.population === "people" ? "people" : "service users";
  const flagCount = opts.flags.skipped.length + opts.flags.errored.length;

  const skippedBlock = listBlock(
    "Already in the system, so skipped",
    opts.flags.skipped.map((n) => escapeHtml(n)),
  );
  const erroredBlock = listBlock(
    "Not added, please fix these in the sheet and upload again",
    opts.flags.errored.map((e) => `${escapeHtml(e.name)}: ${escapeHtml(e.errors.join(" "))}`),
  );

  const body = `
    <p style="margin:0 0 6px 0;">The bulk import into
    <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong> is complete.
    <strong style="color:#ffffff;">${opts.created}</strong> ${noun} were added.
    ${flagCount > 0 ? "Some items need your attention:" : "Nothing needs your attention."}</p>
    ${skippedBlock}
    ${erroredBlock}`;

  const path = opts.population === "people" ? "/people" : "/service-users";
  const label = opts.population === "people" ? "People" : "Service User";

  return {
    subject: `${label} import: ${opts.created} added, ${flagCount} not imported`,
    html: noticeEmailHtml({
      preheader: `${opts.created} ${noun} added, ${flagCount} not imported.`,
      heading: "Your import needs a look",
      bodyHtml: body,
      ctaLabel: "Open the register",
      ctaUrl: `${siteUrl()}${path}`,
      footerNote:
        "You receive this because you are a Company Admin on Be Care Compliant. It summarises a bulk record import that was just run.",
    }),
  };
}
