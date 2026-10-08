/**
 * Be Care Compliant: the wording an AI draft or review becomes (Phil, 2026-10-07).
 *
 * ONE function for the Approve button AND Preview as PDF, so a preview is exactly what would be
 * saved: the edited draft (or the sections chosen from a review) with the "To be completed"
 * answers put in. Anything still unanswered stays marked in the wording; Approve refuses to save
 * it, the preview shows it, so you can see what is left.
 *
 * Isomorphic: no side effects. Reads only the approval form's own fields.
 */

import type { PolicyDraft } from "@/lib/policies/data";
import { fillPlaceholders } from "@/lib/policies/placeholders";
import { joinSections, type ImproveReview } from "@/lib/policies/ai-prompt";

export function composeDraftWording(
  draft: Pick<PolicyDraft, "kind" | "title" | "review">,
  fd: FormData,
): { title: string; wording: string } {
  const title = String(fd.get("title") ?? "").trim() || draft.title;
  /* The "To be completed" fields under the policy (Phil, 2026-10-06), put into the wording. */
  const fills: Record<string, string> = {};
  for (let i = 0; fd.has(`fill_prompt_${i}`); i++) {
    fills[String(fd.get(`fill_prompt_${i}`))] = String(fd.get(`fill_${i}`) ?? "");
  }
  if (draft.kind === "write") {
    return { title, wording: fillPlaceholders(String(fd.get("body") ?? "").trim(), fills) };
  }
  /* A review that could not be read has no sections: no wording, rather than a crash. */
  const review = draft.review as ImproveReview | null;
  if (!review?.sections) return { title, wording: "" };
  const chosen = review.sections.map((s, i) => {
    const use = String(fd.get(`use_${i}`) ?? "proposed");
    const text = use === "original" ? s.original : String(fd.get(`text_${i}`) ?? s.proposed);
    return { heading: s.heading, text: fillPlaceholders(text, fills) };
  });
  return { title, wording: joinSections(title, chosen) };
}
