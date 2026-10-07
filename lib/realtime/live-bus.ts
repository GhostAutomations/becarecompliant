/**
 * Be Care Compliant: one shared listener for live updates (speed plan push 2, 2026-10-07).
 *
 * The database sends {"table": "<name>"} on the private channel "company:<id>" (or "founder")
 * whenever a watched table changes (0418). Several components on one page may want the same
 * channel, and the browser client hands back the SAME channel object for the same name, so one
 * component leaving must not cut the others off. This keeps one channel per topic and counts who
 * is listening; the channel is only closed when the last listener goes.
 *
 * Signed in before joining: the access token is handed to Realtime first, because a private
 * channel is authorised by the rule on realtime.messages and an anonymous join is refused
 * (the same race found 2026-10-01 with the founder inbox).
 */

import { createClient } from "@/lib/supabase/client";

type Listener = {
  onChange: (table: string) => void;
  onStatus?: (connected: boolean) => void;
};

type Entry = {
  listeners: Set<Listener>;
  channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null;
  connected: boolean;
  joining: boolean;
  closed: boolean;
};

const entries = new Map<string, Entry>();

function setStatus(entry: Entry, connected: boolean) {
  entry.connected = connected;
  for (const l of entry.listeners) l.onStatus?.(connected);
}

async function join(topic: string, entry: Entry) {
  if (entry.joining || entry.closed) return;
  entry.joining = true;
  const supabase = createClient();
  try {
    if (entry.channel) {
      const old = entry.channel;
      entry.channel = null;
      await supabase.removeChannel(old);
    }
    const { data } = await supabase.auth.getSession();
    if (entry.closed) return;
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
    if (entry.closed) return;
    const ch = supabase.channel(topic, { config: { private: true } });
    ch.on("broadcast", { event: "changed" }, (msg) => {
      const table = (msg?.payload as { table?: unknown } | undefined)?.table;
      if (typeof table !== "string") return;
      for (const l of entry.listeners) l.onChange(table);
    });
    entry.channel = ch;
    ch.subscribe((status) => {
      if (entry.channel !== ch) return;
      setStatus(entry, status === "SUBSCRIBED");
    });
  } finally {
    entry.joining = false;
  }
}

/** Listen on a live channel. Returns the function that stops listening. */
export function subscribeLive(topic: string, listener: Listener): () => void {
  let entry = entries.get(topic);
  if (!entry) {
    entry = { listeners: new Set(), channel: null, connected: false, joining: false, closed: false };
    entries.set(topic, entry);
  }
  entry.listeners.add(listener);
  if (!entry.channel && !entry.joining) void join(topic, entry);
  else listener.onStatus?.(entry.connected);
  const e = entry;
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size === 0) {
      e.closed = true;
      entries.delete(topic);
      if (e.channel) void createClient().removeChannel(e.channel);
      e.channel = null;
    }
  };
}

/** Join again if the channel has dropped (a tab left hidden lets the heartbeat lapse). */
export function rejoinLive(topic: string) {
  const entry = entries.get(topic);
  if (entry && !entry.connected) void join(topic, entry);
}
