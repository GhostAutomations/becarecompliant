import { NextRequest, NextResponse } from "next/server";
import { runRetentionExpiry } from "@/lib/evidence/retention";
import { runCompanyPurge } from "@/lib/companies/delete-apply";

/**
 * Daily evidence retention: anonymise evidence that is past its retention date.
 *
 * THE LIST item 18. Until this existed the eight year rule was written down in code and in
 * the privacy notice and never once applied, so evidence was kept for ever.
 *
 * What a run does: for each evidence row whose retention_until has passed, and whose Person
 * or Service User is NOT on a retention hold, empty the answers, the author and the files,
 * stamp anonymised_at, remove the objects from the private bucket and write an audit row.
 * The evidence row itself survives, so the compliance history (a check was completed, on
 * this date, against this form version) is intact; the personal data inside it is not.
 *
 * Batched at 200 a run: a long standing customer's first run must not try to anonymise
 * years of evidence in one request. A full batch is reported, never silently truncated.
 *
 * Same auth as the other crons: fails CLOSED in production without CRON_SECRET (503), 401 on
 * a wrong secret. Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retention = await runRetentionExpiry();

  /* THE COMPANY PURGE RIDES ALONG (2026-08-18). A company deleted in the founder console is
     locked and cancelled immediately but not erased for thirty days; this is what erases it.
     It shares the 02:30 slot rather than taking a cron of its own because it does the same kind
     of work — the nightly erasure of things whose time is up — and because a second schedule is
     a second thing to notice has stopped running. */
  const companies = await runCompanyPurge();
  // A FAILED RUN MUST NOT LOOK LIKE A QUIET ONE. Found live 2026-08-11: the function raised
  // "column reference evidence_id is ambiguous", this route swallowed it into a JSON field
  // and answered 200, so Vercel showed a healthy cron and nothing was ever anonymised. For a
  // job whose whole purpose is to run unattended, "nothing was due today" and "this has been
  // broken for months" must never look the same from the outside.
  if (retention.error) {
    console.error("[cron/retention] run failed:", retention.error);
    return NextResponse.json({ retention, companies }, { status: 500 });
  }
  // Same rule for the purge half: a company that was due to be erased and was not is a failed
  // run, and a failed run must not answer 200. A purge that half-completed reports its error
  // here rather than only in the tombstone nobody is watching.
  if (companies.errors.length) {
    console.error("[cron/retention] company purge failed:", companies.errors.join(" | "));
    return NextResponse.json({ retention, companies }, { status: 500 });
  }
  return NextResponse.json({ retention, companies });
}
