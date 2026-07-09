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
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PEOPLE_TABLES = ["people", "check_instances", "person_trackers"];
// Realtime is the primary path (pushes within ~1s). This is only the safety-net
// poll for a dropped socket; kept short so the screen is never stale for long.
const POLL_MS = 10_000;

/**
 * Defaults to the People tables + channel (unchanged). The Service User register
 * passes its own tables (service_users, check_instances, service_user_trackers) and
 * channel, so its RAG rollups update live in exactly the same way. check_instances
 * is shared by both populations, so a completion on either refreshes subscribers.
 */
export default function RealtimeRefresh({
  tables = PEOPLE_TABLES,
  channel: channelName = "people-live",
}: {
  tables?: string[];
  channel?: string;
} = {}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => router.refresh(),
      );
    }
    channel.subscribe();

    // Poll fallback: keeps RAG fresh even if the socket drops.
    const interval = setInterval(() => router.refresh(), POLL_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // tables is a stable literal from the caller; join for a primitive dep.
  }, [router, channelName, tables.join(",")]);

  return null;
}
