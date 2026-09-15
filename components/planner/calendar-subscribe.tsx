"use client";

import { useState, useTransition } from "react";
import { enableCalendarFeed, rotateCalendarFeed, disableCalendarFeed } from "@/lib/planner/calendar-feed-actions";

/**
 * "Add my planner to Outlook".
 *
 * WHAT THIS SCREEN HAS TO BE HONEST ABOUT. Outlook refreshes a subscribed calendar on its own
 * schedule, roughly every three hours and by Microsoft's own account sometimes far longer, and
 * nobody can make it go faster. If we hide that, the first time a booking made this morning is
 * not in Outlook by lunchtime somebody decides the Planner is broken. So it is written on the
 * card, next to the button, before they ever subscribe.
 *
 * AND WHAT THE LINK IS. It is a password, not a bookmark: anyone holding it reads the calendar
 * with no login. The card says so in those words, and Change link is right there, because the
 * fix for a link that went somewhere it should not is one press and no support ticket.
 */

function whenText(iso: string | null): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "not yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(d);
}

export default function CalendarSubscribe({
  url,
  lastFetchedAt,
}: {
  /** Null when they have not made a link yet. */
  url: string | null;
  lastFetchedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingChange, setConfirmingChange] = useState(false);

  function run(fn: () => Promise<{ ok?: string; error?: string }>) {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      setConfirmingChange(false);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">My planner in Outlook</h2>
        {url ? (
          <span className="text-xs text-white/45">Outlook last checked: {whenText(lastFetchedAt)}</span>
        ) : null}
      </div>

      {!url ? (
        <>
          <p className="text-sm text-white/65">
            Add your planner to Outlook as a second calendar, so what you have booked shows up
            alongside everything else in your diary.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Outlook decides when to check for changes, usually every few hours. Be Care Compliant
            is always the up to date version.
          </p>
          <button
            type="button"
            className="btn-primary mt-3 text-sm"
            disabled={pending}
            onClick={() => run(enableCalendarFeed)}
          >
            {pending ? "Creating…" : "Create my calendar link"}
          </button>
        </>
      ) : (
        <>
          <label htmlFor="planner_feed_url" className="form-label">
            Your private calendar link
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="planner_feed_url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <button type="button" className="btn-outline text-sm" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="form-hint mt-2">
            Treat this like a password. Anyone who has the link can read your planner without
            signing in, so do not forward it or paste it anywhere shared. If it does get out,
            press Change link and the old one stops working straight away.
          </p>

          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Adding it to Outlook
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-white/65">
              <li>Open Outlook and go to Calendar.</li>
              <li>Choose Add calendar, then Subscribe from web.</li>
              <li>Paste the link above, give it a name such as BCC Planner, then Import.</li>
            </ol>
            <p className="mt-2 text-xs text-white/45">
              Outlook checks for changes on its own schedule, usually every few hours and
              occasionally longer. A booking you have just made will not appear straight away.
              This works the same way in Google Calendar and Apple Calendar.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {confirmingChange ? (
              <>
                <span className="text-sm text-white/70">
                  Change the link? You will have to add the new one to Outlook again.
                </span>
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={pending}
                  onClick={() => run(rotateCalendarFeed)}
                >
                  {pending ? "Changing…" : "Yes, change it"}
                </button>
                <button
                  type="button"
                  className="btn-outline text-sm"
                  disabled={pending}
                  onClick={() => setConfirmingChange(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-outline text-sm"
                  disabled={pending}
                  onClick={() => setConfirmingChange(true)}
                >
                  Change link
                </button>
                <button
                  type="button"
                  className="btn-outline text-sm"
                  disabled={pending}
                  onClick={() => run(disableCalendarFeed)}
                >
                  {pending ? "Turning off…" : "Turn off"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
