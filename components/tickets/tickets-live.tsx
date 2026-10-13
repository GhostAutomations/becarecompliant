"use client";

/**
 * Tickets update live (Phil, 2026-10-13: "a new ticket or reply appears without me refreshing").
 *
 * The shared live refresh (components/realtime-refresh.tsx), pointed at the ticket tables and the
 * channel that carries their nudges (0454): "founder" in the Founder console, "tickets:<company>"
 * on a company's own Tickets pages. Only Supervisors and up, Recruiters and On Call may join a
 * company's ticket channel, and only the founder may join "founder", so the database decides who
 * is nudged. The nudge carries no ticket content; the page reloads through its normal checks.
 * The shared component keeps the poll fallback for a dropped connection and settles bursts.
 */

import { useEffect, useRef } from "react";
import RealtimeRefresh from "@/components/realtime-refresh";

const TICKET_TABLES = ["support_tickets", "support_ticket_messages"];

export default function TicketsLive({ topic }: { topic: string }) {
  return <RealtimeRefresh topic={topic} tables={TICKET_TABLES} />;
}

/**
 * "New ticket from [company]" when a ticket appears on the Founder list that was not there when
 * the page was first drawn. The tickets already on screen never toast, and each new one toasts
 * once.
 */
export function NewTicketToast({ tickets }: { tickets: Array<{ id: string; company: string | null }> }) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(tickets.map((t) => t.id));
      return;
    }
    for (const t of tickets) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      window.dispatchEvent(
        new CustomEvent("bcc:toast", { detail: { message: `New ticket from ${t.company ?? "a company"}` } }),
      );
    }
  }, [tickets]);
  return null;
}

/**
 * Keeps a conversation scrolled to its newest message (screens rule: oldest at the top, newest at
 * the bottom, scrolled to the latest). On first view and whenever a reply arrives.
 */
export function ScrollToLatest({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (count === 0) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [count]);
  return <div ref={ref} aria-hidden />;
}
