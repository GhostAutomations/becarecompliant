"use client";

import { useState, useTransition } from "react";
import { enableCalendarFeed, rotateCalendarFeed, disableCalendarFeed } from "@/lib/planner/calendar-feed-actions";

/**
 * Sharing your planner to a calendar: the link, the QR code, and the way to revoke both.
 *
 * WHAT THIS SCREEN HAS TO BE HONEST ABOUT. A subscribed calendar refreshes on the calendar app's
 * own schedule, and nobody can make it go faster: Outlook is roughly every three hours and by
 * Microsoft's own account sometimes far longer, Google is slower still, and only Apple honours
 * the fifteen minute hint in the file. If we hide that, the first time a booking made this
 * morning is not in Outlook by lunchtime somebody decides the Planner is broken. So it is next
 * to the button, before they ever subscribe.
 *
 * WHY THE LINK AND THE QR ARE BOTH HERE, AND CARRY DIFFERENT FORMS OF THE SAME URL. A computer
 * needs a pasted https link, because that is what Outlook on the web asks for, and you cannot
 * scan a code into the browser you are already sitting in front of. A phone needs the webcal
 * form, which opens the calendar app's SUBSCRIBE prompt: scanned as https it would download a
 * one-off copy of today's bookings instead, which is the same dead end as Outlook's "Upload from
 * file". Neither one replaces the other.
 *
 * WHY THE QR IS HIDDEN UNTIL ASKED FOR. It is a password drawn as a picture. Care offices are
 * open plan and people share their screens, and nobody needs it on display while they are doing
 * something else on this page. One tap to reveal removes the only new risk the QR introduces.
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

export type FeedClient = {
  client: string;
  userAgent: string | null;
  lastFetchedAt: string;
  fetchCount: number;
};

export default function CalendarSubscribe({
  url,
  qrDataUrl,
  lastFetchedAt,
  clients,
}: {
  /** Null when they have not made a link yet. */
  url: string | null;
  /** The webcal form of the same link, drawn as a QR code on the server. */
  qrDataUrl: string | null;
  lastFetchedAt: string | null;
  /** Which calendar apps have actually fetched, newest first. */
  clients: FeedClient[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmingChange, setConfirmingChange] = useState(false);

  function run(fn: () => Promise<{ ok?: string; error?: string }>) {
    setError(null);
    setCopied(false);
    setShowQr(false);
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
        <h2 className="text-[15px] font-semibold text-white">My planner in my calendar</h2>
        {url ? (
          <span className="text-xs text-white/45">Last checked: {whenText(lastFetchedAt)}</span>
        ) : null}
      </div>

      {!url ? (
        <>
          <p className="text-sm text-white/65">
            Add your planner to Outlook, your phone, or any other calendar, so what you have
            booked shows up alongside everything else in your diary.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Your calendar decides when to check for changes, usually every few hours. Be Care
            Compliant is always the up to date version.
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

          {/* ON A COMPUTER */}
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              On a computer, for Outlook
            </p>
            <p className="mt-2 text-sm text-white/65">
              The Outlook app on a Mac cannot subscribe to a calendar link. Do this once in
              Outlook on the web and it appears in the app afterwards.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-white/65">
              <li>Go to outlook.office.com and sign in.</li>
              <li>Open Calendar from the left-hand side.</li>
              <li>Choose Add calendar, then Subscribe from web.</li>
              <li>Paste the link above, give it a name, then Import.</li>
              <li>It shows in the Outlook app within about ten minutes, under Other calendars.</li>
            </ol>
            <p className="mt-2 text-xs text-amber-200/80">
              Do not use Upload from file. That copies your bookings in once and never updates
              them again.
            </p>
          </div>

          {/* ON A PHONE */}
          <div className="mt-3 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              On a phone
            </p>
            <p className="mt-2 text-sm text-white/65">
              Point your phone camera at the code and open what it offers. Your calendar app will
              ask whether to subscribe. On an iPhone this puts the planner straight into the
              Calendar app, and it updates faster there than anywhere else.
            </p>

            {qrDataUrl ? (
              showQr ? (
                <div className="mt-3">
                  <div className="inline-block rounded-lg bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR code for your private calendar link" width={200} height={200} />
                  </div>
                  <div className="mt-2">
                    <button type="button" className="btn-outline text-sm" onClick={() => setShowQr(false)}>
                      Hide code
                    </button>
                  </div>
                  <p className="form-hint mt-2">
                    This code is your link, so anyone who photographs it has your planner. Hide it
                    again when you are done.
                  </p>
                </div>
              ) : (
                <button type="button" className="btn-outline mt-3 text-sm" onClick={() => setShowQr(true)}>
                  Show QR code
                </button>
              )
            ) : null}

            <p className="mt-3 text-xs text-white/45">
              A Samsung or other Android phone cannot subscribe on the device. Add the link at
              calendar.google.com under Other calendars, From URL, and it syncs to the phone.
            </p>
          </div>

          <p className="mt-3 text-xs text-white/45">
            Every calendar checks for changes on its own schedule, usually every few hours and
            occasionally longer. A booking you have just made will not appear straight away.
          </p>

          {/*
            WHICH CALENDAR LAST LOOKED, AND WHEN.
            Phil, 2026-09-15: Outlook fetched once when he subscribed, a booking was made five
            minutes later, and Outlook showed nothing for hours. Nothing was broken, but proving
            that meant reading server logs. This panel puts the one fact that answers it on the
            screen, so "why can I not see it yet" stops being a support conversation.
          */}
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Which calendars have checked
            </p>
            {clients.length === 0 ? (
              <p className="mt-2 text-sm text-white/65">
                Nothing has fetched this link yet. Once you add it to a calendar, that calendar
                will appear here the first time it looks.
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-1.5">
                  {clients.map((c) => (
                    <li key={c.client} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm text-white">{c.client}</span>
                      <span className="text-xs text-white/55">
                        last checked {whenText(c.lastFetchedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-white/45">
                  If a booking is missing from one of these, compare the time it last checked with
                  when you made the booking. A calendar that has not looked since cannot know
                  about it yet, and there is no way to hurry it along.
                </p>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {confirmingChange ? (
              <>
                <span className="text-sm text-white/70">
                  Change the link? You will have to add the new one to every calendar again.
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
