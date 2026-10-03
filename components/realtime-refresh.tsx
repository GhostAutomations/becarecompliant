"use client";

/**
 * Be Care Compliant — shared live refresh (Phase 3). Mount on any screen showing
 * RAG rollups (the register, the dashboard). It subscribes UNFILTERED to the
 * People tables (RLS scopes which events reach this user; filtered subscriptions
 * drop RLS events, per the Phase 1 realtime gotcha) and refreshes the server
 * components on any change, with a poll fallback so it is never stale for long.
 * people, check_instances and person_trackers all have REPLICA IDENTITY FULL so
 * UPDATE/DELETE events carry through, and are in the supabase_realtime publication.
 * check_instances covers form/date checks (supervision, spot check, appraisal, and
 * the appraisal->supervision re-anchor); person_trackers covers the document/date
 * trackers (probation, DBS, right to work). A check_instances change also refreshes
 * the supervision Evidence-derived slots, so Evidence itself need not be published.
 *
 * IT IS A PUSH, NOT A RELOAD (Phil, 2026-09-08: "i dont want it to refresh so the screen
 * jumps like we had previously, i want the dates to appear with a push"). router.refresh()
 * re-renders the server components and lets React swap only what actually changed: the
 * page is not reloaded, client state is kept, and a cell whose date has moved is the only
 * thing that moves. Nothing here ever calls location.reload().
 *
 * AWAY AND BACK. A hidden tab was the hole: the browser throttles background timers and
 * defers the paint, so a completion made in another tab fetched fine and never reached the
 * screen -- measured 2026-09-08, the payload carried the new date and the matrix showed the
 * old one twenty five seconds later. So the tab now does nothing at all while it is hidden
 * (no poll, no churn on a screen nobody is looking at) and pushes once the moment it comes
 * back, which is exactly when somebody is there to read it.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PEOPLE_TABLES = ["people", "check_instances", "person_trackers"];
// Realtime is the primary path (pushes within ~1s). This is only the safety-net
// poll for a dropped socket; kept short so the screen is never stale for long.
const POLL_MS = 10_000;
/* AUDIT B1 (3 Oct 2026): the refresh storm. Every change event called router.refresh() on the
   spot, and the poll ran even while the socket was healthy. A bulk change (a data load, a demo
   rebuild, a cron touching a few hundred checks) became a few hundred full re-renders of the
   dashboard per open tab, each one twenty or more database reads: 2 Oct, 10:00 to 10:30, two open
   dashboards made about 97,000 requests, and 3 Oct one tab made 11,700 in five minutes. Now a
   burst of events becomes ONE refresh once it settles, never more often than MIN_GAP_MS, and the
   poll only runs while the socket is actually down. The push still lands within a second or two. */
const SETTLE_MS = 800;
const MIN_GAP_MS = 3_000;

/**
 * Defaults to the People tables + channel (unchanged). The Service User register
 * passes its own tables (service_users, check_instances, service_user_trackers) and
 * channel, so its RAG rollups update live in exactly the same way. check_instances
 * is shared by both populations, so a completion on either refreshes subscribers.
 */
export default function RealtimeRefresh({
  tables = PEOPLE_TABLES,
  channel: channelName = "people-live",
  pollMs = POLL_MS,
}: {
  tables?: string[];
  channel?: string;
  /** Safety net only. The founder inbox passes a long one: on a screen you READ, a refresh you
   *  did not ask for moves the page under you, so it must be rare (Phil, 2026-09-04). */
  pollMs?: number;
} = {}) {
  const router = useRouter();

  useEffect(() => {
    const visible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";
    /* A change that lands while the tab is hidden is dropped, not painted: the browser
       would defer the paint anyway, and refreshing a screen nobody is reading is churn.
       Coming back pushes once, which catches up everything missed in one go. */
    let lastRefresh = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshNow = () => {
      timer = null;
      if (!visible()) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    /* Trailing: wait for the burst to settle, and keep at least MIN_GAP_MS between refreshes. */
    const push = () => {
      if (!visible()) return;
      if (timer) return;
      const wait = Math.max(SETTLE_MS, lastRefresh + MIN_GAP_MS - Date.now());
      timer = setTimeout(refreshNow, wait);
    };
    /* True only while the socket is joined. The poll below is a safety net for a dropped socket,
       so it stays quiet while this is true. */
    let connected = false;

    /* SIGNED IN BEFORE SUBSCRIBING (found 2026-10-01: a forms help note reached the founder
       inbox table and the open inbox never showed it until Phil refreshed). The browser client
       reads the login from the cookie a moment after it is created, and subscribing straight
       away raced it: the socket joined as an anonymous visitor (realtime.subscription showed
       claims_role "anon"), RLS correctly sent that visitor nothing, and the only thing that ever
       caught up was the slow fallback poll. So the token is handed to Realtime first, and only
       then does the channel join. Token refreshes after that are passed on by supabase-js. */
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    /* JOIN, AND JOIN AGAIN WHEN IT DROPS (audit B1, measured 3 Oct): a tab left hidden for a few
       minutes lets the socket's heartbeat lapse, the channel closes, and the page was left on the
       ten second poll for as long as it stayed open. Coming back to the tab now rebuilds the
       channel if it is not joined, so the poll is only ever a stop gap. */
    let joining = false;
    const join = async () => {
      // Focus and visibilitychange both fire on return: one rejoin, not two channels.
      if (joining) return;
      joining = true;
      try {
        await joinOnce();
      } finally {
        joining = false;
      }
    };
    const joinOnce = async () => {
      if (channel) {
        const old = channel;
        channel = null;
        await supabase.removeChannel(old);
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      const ch = supabase.channel(channelName);
      for (const table of tables) {
        ch.on("postgres_changes", { event: "*", schema: "public", table }, push);
      }
      channel = ch;
      ch.subscribe((status) => {
        if (channel !== ch) return; // a channel we have already replaced
        connected = status === "SUBSCRIBED";
      });
    };
    void join();

    // Poll fallback for a dropped socket. Only while the tab is being looked at.
    const interval = setInterval(() => {
      if (!connected) push();
    }, pollMs);

    /* Back on the screen: push once, so what changed while you were away is simply there.
       Unconditional, because a socket that dropped while hidden would have had nothing to
       report either way. */
    const onVisible = () => {
      if (!visible()) return;
      if (!connected) void join();
      push();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // tables is a stable literal from the caller; join for a primitive dep.
  }, [router, channelName, pollMs, tables.join(",")]);

  return null;
}
