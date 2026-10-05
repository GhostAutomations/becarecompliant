import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";

/**
 * Is this tab's session still the one holding its slot? (Phil, popup 2026-10-05.)
 *
 * WHY. A second sign in on the same kind of device already ends the first one (0273, 0381), but
 * the old tab only found out on its next click: a page left open in Edge looked signed in for as
 * long as nobody touched it. SessionWatch asks here when the tab comes back into view and once a
 * minute while it is visible, so the old tab shows "signed in elsewhere" on its own.
 *
 * THE SAME CHECK AS EVERY PAGE, not a second copy of it. requireUser is what every page runs:
 * a displaced session redirects to the sign in page with the reason, and so does a session the
 * middleware already found ended. The tab follows that redirect. Nothing is returned about
 * anybody else, and the answer is never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
