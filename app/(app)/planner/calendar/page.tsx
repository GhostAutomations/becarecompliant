import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import { PLANNER_ROLES } from "@/lib/planner/data";
import { getMyFeed, feedUrl, feedWebcalUrl } from "@/lib/planner/calendar-feed";
import CalendarSubscribe from "@/components/planner/calendar-subscribe";

/**
 * Sharing your planner to a calendar. Reached from the Share button on the Planner.
 *
 * ITS OWN PAGE, not a card on the Planner. The Planner is a full-height calendar and the one
 * thing it should not grow is a panel nobody needs after the day they set it up. This is a five
 * minute job done once, so it lives one click away with a Back link, like every other sub-page.
 *
 * ALWAYS THE VIEWER'S OWN LINK. There is no id in the route and nothing to pass: getMyFeed reads
 * through RLS as the signed-in user, so this page is incapable of showing anyone else's.
 *
 * THE QR IS RENDERED HERE, ON THE SERVER. The content security policy blocks outside scripts, so
 * the usual browser-side QR libraries are not an option, and it needs no interactivity anyway.
 * It carries the WEBCAL form of the link, because scanning an https link to a .ics makes a phone
 * download a one-off copy instead of subscribing to it.
 */

export const metadata: Metadata = { title: "Share my planner" };

export default async function PlannerCalendarPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!PLANNER_ROLES.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "planner"))) redirect("/dashboard");

  const feed = await getMyFeed();

  // PNG rather than SVG: it renders identically everywhere an <img> does, with none of the
  // SVG-inside-img quirks, and the data URI is allowed by the img-src policy.
  const qr = feed
    ? await QRCode.toDataURL(feedWebcalUrl(feed.token), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 260,
        color: { dark: "#0b1220", light: "#ffffff" },
      })
    : null;

  return (
    <div className="page-shell space-y-6">
      <div>
        <BackLink href="/planner" label="Back to My Planner" />
        <h1 className="page-title mt-1">Share my planner</h1>
        <p className="page-subtitle mt-1">
          Show what you have booked in your own calendar, alongside everything else in your day.
        </p>
      </div>

      <CalendarSubscribe
        url={feed ? feedUrl(feed.token) : null}
        qrDataUrl={qr}
        lastFetchedAt={feed?.lastFetchedAt ?? null}
      />
    </div>
  );
}
