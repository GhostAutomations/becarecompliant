import { NextResponse } from "next/server";
import { loadFeedByToken } from "@/lib/planner/calendar-feed";
import { buildPlannerFeed } from "@/lib/planner/ics";

/**
 * PUBLIC route: the planner calendar Outlook subscribes to. No session, no cookie.
 *
 * It is in PUBLIC_PATHS because Outlook will never be signed in. The token in the URL is the
 * entire authentication, which is why loadFeedByToken derives every filter from the token and
 * takes nothing from the request: there is no id, no company and no date range a caller could
 * put in the URL to widen what comes back.
 *
 * WHAT A WRONG TOKEN GETS. A plain 404 with no body detail, identical for a token that never
 * existed, one that has been rotated, and one whose owner's account is gone. Anything that
 * distinguished them would turn this into an oracle for probing.
 *
 * NEVER CACHED at the edge. A cached calendar is a calendar served to whoever asks next, and
 * these are per person. force-dynamic and no-store together, because being wrong here leaks
 * one colleague's diary to another.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const feed = await loadFeedByToken(token);
  if (!feed) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const name = feed.subject.ownerName ? `BCC Planner: ${feed.subject.ownerName}` : "BCC Planner";
  const body = buildPlannerFeed(feed.events, {
    calendarName: name,
    uidDomain: "becarecompliant.com",
    now: new Date(),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="planner.ics"',
      "Cache-Control": "no-store, max-age=0",
      // A calendar URL has no business being indexed or followed.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
