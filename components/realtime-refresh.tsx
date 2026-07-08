"use client";

/**
 * Be Care Compliant — shared live refresh (Phase 3). Mount on any screen showing
 * RAG rollups (the register, the dashboard). It subscribes UNFILTERED to the
 * People tables (RLS scopes which events reach this user; filtered subscriptions
 * drop RLS events, per the Phase 1 realtime gotcha) and refreshes the server
 * components on any change, with a poll fallback so it is never stale for long.
 * Both people and check_instances have REPLICA IDENTITY FULL (migration 0004) so
 * UPDATE/DELETE events carry through, and are in the supabase_realtime publication
 * (migration 0005).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["people", "check_instances"] as const;
const POLL_MS = 60_000;

export default function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("people-live");
    for (const table of TABLES) {
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
  }, [router]);

  return null;
}
