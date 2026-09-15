import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import { PLANNER_ROLES } from "@/lib/planner/data";
import { getMyFeed, feedUrl } from "@/lib/planner/calendar-feed";
import CalendarSubscribe from "@/components/planner/calendar-subscribe";

/**
 * Where an office member connects their planner to Outlook.
 *
 * ITS OWN PAGE, not a card on the Planner. The Planner is a full-height calendar and the one
 * thing it should not grow is a panel nobody needs after the day they set it up. This is a
 * five minute job done once, so it lives one click away with a Back link, like every other
 * sub-page.
 *
 * ALWAYS THE VIEWER'S OWN LINK. There is no id in the route and nothing to pass: getMyFeed
 * reads through RLS as the signed-in user, so this page is incapable of showing anyone else's.
 */

export const metadata: Metadata = { title: "My planner in Outlook" };

export default async function PlannerCalendarPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!PLANNER_ROLES.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const feed = await getMyFeed();

  return (
    <div className="page-shell space-y-6">
      <div>
        <BackLink href="/planner" label="Back to My Planner" />
        <h1 className="page-title mt-1">My planner in Outlook</h1>
        <p className="page-subtitle mt-1">
          Show what you have booked in your own calendar, alongside everything else in your day.
        </p>
      </div>

      <CalendarSubscribe
        url={feed ? feedUrl(feed.token) : null}
        lastFetchedAt={feed?.lastFetchedAt ?? null}
      />
    </div>
  );
}
