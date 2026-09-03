"use client";

/**
 * Be Care Compliant — the founder's email screen, laid out like a mail client.
 *
 * Phil, 2026-09-03: "lets call inbox Email and lets make it look like outlook."
 *
 * WHAT THAT MEANS HERE. The Outlook thing worth copying is the SHAPE, not the blue chrome:
 * folders down the side, a scannable list in the middle, the message itself in a reading pane,
 * and a reply that starts where you are reading rather than on another screen. That is a layout
 * people already know how to use, in this product's own colours.
 *
 * EVERY WORD IN HERE WAS TYPED BY A STRANGER. Sender, subject and body arrive from the open
 * internet. React escapes text by construction, and the HTML part of a received email is
 * deliberately NOT rendered — it is kept in the archive and the plain text is what you read.
 * Nothing in this file goes near dangerouslySetInnerHTML.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import ActionForm from "@/components/action-form";
import {
  previewOf,
  withoutQuotedReply,
  replySubject,
} from "@/lib/founder/inbox";

export type EmailRow = {
  id: string;
  direction: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  body_error: string | null;
  attachments: unknown;
  trial_request_id: string | null;
  is_read: boolean;
  is_spam: boolean;
  send_error: string | null;
  occurred_at: string;
};

type Folder = "inbox" | "sent" | "other";

type Actions = {
  reply: (prev: never, formData: FormData) => Promise<never>;
  setRead: (prev: never, formData: FormData) => Promise<never>;
  fetchBody: (prev: never, formData: FormData) => Promise<never>;
};

/** Short and human: today shows a time, this year a date, older a date with the year. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function fullWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailClient({
  rows,
  leadNames,
  actions,
}: {
  rows: EmailRow[];
  leadNames: Record<string, string>;
  actions: Actions;
}) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const folders = useMemo(() => {
    const inbox = rows.filter((r) => r.direction === "in" && !r.is_spam);
    const sent = rows.filter((r) => r.direction === "out");
    const other = rows.filter((r) => r.direction === "in" && r.is_spam);
    return { inbox, sent, other };
  }, [rows]);

  const list = folders[folder];
  const unread = folders.inbox.filter((r) => !r.is_read).length;

  const selected = list.find((r) => r.id === selectedId) ?? list[0] ?? null;

  const FolderButton = ({
    id,
    label,
    count,
    badge,
  }: {
    id: Folder;
    label: string;
    count: number;
    badge?: number;
  }) => (
    <button
      type="button"
      onClick={() => {
        setFolder(id);
        setSelectedId(null);
      }}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
        folder === id
          ? "bg-white/10 font-semibold text-white"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span>{label}</span>
      {badge ? (
        <span className="pill pill-amber">{badge}</span>
      ) : (
        <span className="text-xs text-white/40">{count || ""}</span>
      )}
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_320px_minmax(0,1fr)]">
      {/* FOLDERS */}
      <nav className="glass-card h-fit p-2">
        <FolderButton id="inbox" label="Inbox" count={folders.inbox.length} badge={unread} />
        <FolderButton id="sent" label="Sent" count={folders.sent.length} />
        <FolderButton id="other" label="Other" count={folders.other.length} />
        <p className="px-3 pb-1 pt-3 text-[11px] leading-snug text-white/40">
          Other holds bounces and out of office replies, so they do not sit in the Inbox looking
          like somebody waiting on an answer.
        </p>
      </nav>

      {/* LIST */}
      <div className="glass-card max-h-[70vh] overflow-y-auto p-1">
        {list.length === 0 ? (
          <p className="p-4 text-sm text-white/50">
            {folder === "inbox"
              ? "Nothing in the Inbox. Anything sent to your receiving address appears here the moment it arrives."
              : folder === "sent"
                ? "Nothing sent from here yet."
                : "No bounces or automatic replies."}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((r) => {
              const inbound = r.direction === "in";
              const who = inbound
                ? r.from_name || r.from_address
                : (r.to_addresses ?? []).join(", ") || "—";
              const isSelected = selected?.id === r.id;
              const isUnread = inbound && !r.is_read;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full border-l-2 px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "border-l-amber-400 bg-white/10"
                        : isUnread
                          ? "border-l-amber-400/60 hover:bg-white/5"
                          : "border-l-transparent hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-sm ${
                          isUnread ? "font-semibold text-white" : "text-white/80"
                        }`}
                      >
                        {who}
                      </span>
                      <span className="shrink-0 text-[11px] text-white/40">
                        {whenLabel(r.occurred_at)}
                      </span>
                    </div>
                    <div
                      className={`truncate text-sm ${
                        isUnread ? "text-white" : "text-white/70"
                      }`}
                    >
                      {r.subject || "(no subject)"}
                    </div>
                    <div className="truncate text-xs text-white/40">
                      {r.send_error
                        ? "Did not send"
                        : previewOf(withoutQuotedReply(r.body_text) || r.body_text, 80)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* READING PANE */}
      <div className="glass-card min-h-[50vh] p-5">
        {!selected ? (
          <p className="text-sm text-white/50">Choose a message to read it.</p>
        ) : (
          <article className="space-y-4">
            <header className="space-y-2 border-b border-white/10 pb-4">
              <h2 className="text-lg font-semibold text-white">
                {selected.subject || "(no subject)"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
                <span className={selected.direction === "in" ? "pill pill-green" : "pill pill-neutral"}>
                  {selected.direction === "in" ? "Received" : "Sent"}
                </span>
                {selected.send_error ? <span className="pill pill-red">Did not send</span> : null}
                {selected.trial_request_id && leadNames[selected.trial_request_id] ? (
                  <Link
                    href="/founder/trial-requests"
                    className="pill pill-neutral underline decoration-white/30"
                  >
                    {leadNames[selected.trial_request_id]}
                  </Link>
                ) : null}
              </div>
              <p className="text-sm text-white/60">
                {selected.direction === "in" ? "From" : "To"}{" "}
                <span className="text-white/80">
                  {selected.direction === "in"
                    ? selected.from_name
                      ? `${selected.from_name} (${selected.from_address})`
                      : selected.from_address
                    : (selected.to_addresses ?? []).join(", ")}
                </span>
              </p>
              <p className="text-xs text-white/40">{fullWhen(selected.occurred_at)}</p>
            </header>

            {/* PLAIN TEXT ONLY — see the file header. */}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
              {selected.body_text ? (
                selected.body_text
              ) : selected.body_error ? (
                <span className="text-amber-300">
                  The content could not be collected: {selected.body_error}
                </span>
              ) : selected.body_html ? (
                <span className="text-white/50">
                  This message was sent as HTML only. The original is kept in full; there is no
                  plain text to show.
                </span>
              ) : (
                <span className="text-white/50">
                  No text on this message. That can mean the sender wrote only a subject, or that
                  the content has not been collected yet.
                </span>
              )}
            </div>

            {selected.send_error ? (
              <p className="text-xs text-red-300">{selected.send_error}</p>
            ) : null}

            {Array.isArray(selected.attachments) && selected.attachments.length > 0 ? (
              <p className="text-xs text-white/50">
                {selected.attachments.length}{" "}
                {selected.attachments.length === 1 ? "attachment" : "attachments"} — not
                downloaded.
              </p>
            ) : null}

            {selected.direction === "in" ? (
              <div className="space-y-4 border-t border-white/10 pt-4">
                <ActionForm
                  key={`reply-${selected.id}`}
                  action={actions.reply as never}
                  hidden={{
                    to: selected.from_address,
                    subject: replySubject(selected.subject),
                    reply_to_id: selected.id,
                    trial_request_id: selected.trial_request_id ?? "",
                  }}
                  label="Send reply"
                  savingLabel="Sending…"
                  savedLabel="Sent"
                  className="space-y-3"
                >
                  <div>
                    <label htmlFor={`reply-body-${selected.id}`} className="form-label">
                      Reply to {selected.from_address}
                    </label>
                    <textarea
                      id={`reply-body-${selected.id}`}
                      name="body"
                      rows={6}
                      maxLength={20000}
                      required
                      placeholder="Goes out from your own address and stays on this thread."
                    />
                  </div>
                </ActionForm>

                <div className="flex flex-wrap items-start gap-3">
                  <ActionForm
                    key={`read-${selected.id}`}
                    action={actions.setRead as never}
                    hidden={{
                      email_id: selected.id,
                      read: selected.is_read ? "false" : "true",
                    }}
                    label={selected.is_read ? "Mark as unread" : "Mark as done"}
                    savedLabel="Saved"
                    buttonClassName="btn-secondary text-xs"
                  />
                  {!selected.body_text ? (
                    <ActionForm
                      key={`body-${selected.id}`}
                      action={actions.fetchBody as never}
                      hidden={{ email_id: selected.id }}
                      label="Collect the content"
                      savingLabel="Collecting…"
                      savedLabel="Done"
                      buttonClassName="btn-secondary text-xs"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        )}
      </div>
    </div>
  );
}
