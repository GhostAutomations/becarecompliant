"use client";

/**
 * Be Care Compliant — the founder's email screen, laid out like a mail client.
 *
 * Phil, 2026-09-03: "lets call inbox Email and lets make it look like outlook", then, on seeing
 * the first attempt: "looks nothing like outlook, i want the same layout, with a new button as
 * well."
 *
 * WHY THE FIRST ATTEMPT FAILED: it used an arbitrary Tailwind grid template
 * (grid-cols-[180px_320px_minmax(0,1fr)]) which never generated, so the three panes stacked
 * vertically and it read as three cards, not a mail client. THIS USES FLEX WITH EXPLICIT WIDTHS
 * — no arbitrary track lists, nothing that can silently fail to compile.
 *
 * THE SHAPE, which is the part of Outlook worth copying:
 *   New mail button, top left, above the folders.
 *   Folders down the side with counts.
 *   A dense scannable list: who, when, subject, preview, unread in bold with a marker.
 *   A reading pane beside it, with the actions across the top and the reply where you are
 *   already looking.
 *
 * EVERY WORD IN HERE WAS TYPED BY A STRANGER. React escapes text by construction, and the HTML
 * part of a received email is deliberately NOT rendered — it is kept in the archive and the
 * plain text is what you read. Nothing in this file goes near dangerouslySetInnerHTML.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import ActionForm from "@/components/action-form";
import { previewOf, withoutQuotedReply, replySubject } from "@/lib/founder/inbox";

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

const FOLDER_LABEL: Record<Folder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  other: "Other",
};

/** Today shows a time, this year a date, older a date with the year. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
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

/** Two letters for the avatar disc, from a name if we have one, otherwise the address. */
function initialsOf(name: string | null, address: string): string {
  const source = (name || address.split("@")[0] || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
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
  const [composing, setComposing] = useState(false);

  const folders = useMemo(
    () => ({
      inbox: rows.filter((r) => r.direction === "in" && !r.is_spam),
      sent: rows.filter((r) => r.direction === "out"),
      other: rows.filter((r) => r.direction === "in" && r.is_spam),
    }),
    [rows],
  );

  const list = folders[folder];
  const unread = folders.inbox.filter((r) => !r.is_read).length;
  const selected = composing ? null : (list.find((r) => r.id === selectedId) ?? list[0] ?? null);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* ---------------- FOLDERS ---------------- */}
      <aside className="w-full shrink-0 lg:w-[180px]">
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setSelectedId(null);
          }}
          className="btn-primary mb-3 w-full justify-center text-sm"
        >
          New
        </button>

        <nav className="glass-card p-1.5">
          {(["inbox", "sent", "other"] as Folder[]).map((id) => {
            const count = folders[id].length;
            const badge = id === "inbox" ? unread : 0;
            const active = folder === id && !composing;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFolder(id);
                  setSelectedId(null);
                  setComposing(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition ${
                  active
                    ? "bg-white/10 font-semibold text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{FOLDER_LABEL[id]}</span>
                {badge > 0 ? (
                  <span className="rounded-full bg-amber-400/20 px-1.5 text-[11px] font-semibold text-amber-200">
                    {badge}
                  </span>
                ) : (
                  <span className="text-[11px] text-white/35">{count || ""}</span>
                )}
              </button>
            );
          })}
        </nav>
        <p className="px-1 pt-2 text-[11px] leading-snug text-white/35">
          Other holds bounces and out of office replies, so they do not sit in the Inbox looking
          like somebody waiting on an answer.
        </p>
      </aside>

      {/* ---------------- LIST ---------------- */}
      <div className="w-full shrink-0 lg:w-[300px]">
        <div className="glass-card overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-white/10 px-3 py-2">
            <h2 className="text-sm font-semibold text-white">{FOLDER_LABEL[folder]}</h2>
            <span className="text-[11px] text-white/40">
              {list.length} {list.length === 1 ? "message" : "messages"}
            </span>
          </div>

          {list.length === 0 ? (
            <p className="px-3 py-6 text-sm text-white/50">
              {folder === "inbox"
                ? "Nothing here. Anything sent to your address appears the moment it arrives."
                : folder === "sent"
                  ? "Nothing sent from here yet."
                  : "No bounces or automatic replies."}
            </p>
          ) : (
            <ul className="max-h-[62vh] divide-y divide-white/5 overflow-y-auto">
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
                      onClick={() => {
                        setComposing(false);
                        setSelectedId(r.id);
                      }}
                      className={`flex w-full gap-2.5 border-l-2 px-2.5 py-2 text-left transition ${
                        isSelected
                          ? "border-l-amber-400 bg-white/10"
                          : "border-l-transparent hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          inbound ? "bg-amber-400/20 text-amber-100" : "bg-white/10 text-white/70"
                        }`}
                      >
                        {initialsOf(inbound ? r.from_name : null, inbound ? r.from_address : who)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-[13px] ${
                              isUnread ? "font-semibold text-white" : "text-white/80"
                            }`}
                          >
                            {who}
                          </span>
                          <span className="shrink-0 text-[11px] text-white/35">
                            {whenLabel(r.occurred_at)}
                          </span>
                        </span>
                        <span
                          className={`block truncate text-[13px] ${
                            isUnread ? "font-medium text-white" : "text-white/70"
                          }`}
                        >
                          {r.subject || "(no subject)"}
                        </span>
                        <span className="block truncate text-[11px] text-white/40">
                          {r.send_error
                            ? "Did not send"
                            : previewOf(withoutQuotedReply(r.body_text) || r.body_text, 70)}
                        </span>
                      </span>
                      {isUnread ? (
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ---------------- READING PANE / COMPOSE ---------------- */}
      <div className="min-w-0 flex-1">
        <div className="glass-card min-h-[60vh] p-5">
          {composing ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">New message</h2>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="text-xs text-white/60 underline decoration-white/30 hover:text-white"
                >
                  Discard
                </button>
              </div>
              <ActionForm
                action={actions.reply as never}
                label="Send"
                savingLabel="Sending…"
                savedLabel="Sent"
                className="space-y-3"
                onDone={() => setComposing(false)}
              >
                <div>
                  <label htmlFor="compose-to" className="form-label">
                    To
                  </label>
                  <input
                    id="compose-to"
                    name="to"
                    type="email"
                    required
                    placeholder="somebody@theircompany.co.uk"
                  />
                </div>
                <div>
                  <label htmlFor="compose-subject" className="form-label">
                    Subject
                  </label>
                  <input
                    id="compose-subject"
                    name="subject"
                    maxLength={300}
                    required
                    placeholder="What it is about"
                  />
                </div>
                <div>
                  <label htmlFor="compose-body" className="form-label">
                    Message
                  </label>
                  <textarea
                    id="compose-body"
                    name="body"
                    rows={12}
                    maxLength={20000}
                    required
                    placeholder="Goes out from your own address. Their reply comes back here."
                  />
                </div>
              </ActionForm>
            </section>
          ) : !selected ? (
            <p className="text-sm text-white/50">Choose a message to read it.</p>
          ) : (
            <article className="space-y-4">
              <header className="space-y-3 border-b border-white/10 pb-4">
                <h2 className="text-lg font-semibold text-white">
                  {selected.subject || "(no subject)"}
                </h2>

                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-100">
                    {initialsOf(
                      selected.direction === "in" ? selected.from_name : null,
                      selected.direction === "in"
                        ? selected.from_address
                        : (selected.to_addresses ?? []).join(", "),
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/85">
                      {selected.direction === "in"
                        ? selected.from_name
                          ? `${selected.from_name} <${selected.from_address}>`
                          : selected.from_address
                        : (selected.to_addresses ?? []).join(", ")}
                    </p>
                    <p className="text-xs text-white/40">
                      {selected.direction === "in" ? "To you" : "Sent by you"} ·{" "}
                      {fullWhen(selected.occurred_at)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selected.send_error ? (
                    <span className="pill pill-red">Did not send</span>
                  ) : null}
                  {selected.trial_request_id && leadNames[selected.trial_request_id] ? (
                    <Link
                      href="/founder/trial-requests"
                      className="pill pill-neutral underline decoration-white/30"
                    >
                      {leadNames[selected.trial_request_id]}
                    </Link>
                  ) : null}
                  {selected.direction === "in" ? (
                    <>
                      <ActionForm
                        key={`read-${selected.id}`}
                        action={actions.setRead as never}
                        hidden={{
                          email_id: selected.id,
                          read: selected.is_read ? "false" : "true",
                        }}
                        label={selected.is_read ? "Mark unread" : "Mark as done"}
                        savedLabel="Saved"
                        buttonClassName="btn-outline text-xs"
                        className=""
                      />
                      {!selected.body_text ? (
                        <ActionForm
                          key={`body-${selected.id}`}
                          action={actions.fetchBody as never}
                          hidden={{ email_id: selected.id }}
                          label="Collect the content"
                          savingLabel="Collecting…"
                          savedLabel="Done"
                          buttonClassName="btn-outline text-xs"
                          className=""
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
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
                    No text on this message. That can mean the sender wrote only a subject, or
                    that the content has not been collected yet.
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
                <div className="border-t border-white/10 pt-4">
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
                </div>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
