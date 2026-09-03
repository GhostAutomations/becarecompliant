"use client";

/**
 * Be Care Compliant — Founder > Email, laid out and coloured like Outlook.
 *
 * Phil, 2026-09-03: "make it look like outlook", then, with a screenshot of his own Outlook:
 * "even worse, make it look like outlook but not dark."
 *
 * SO THIS IS THE ONE LIGHT SURFACE IN THE PRODUCT, deliberately. Everything else is navy glass.
 * Email is the exception because it is not really a Be Care Compliant screen: it is a mail
 * client, and people read mail on white. It is founder only, so no customer ever meets the
 * inconsistency.
 *
 * ALL STYLING IS HAND WRITTEN CSS in globals.css under .mailx, NOT Tailwind utilities. Two
 * earlier attempts at this screen were lost to classes that silently never generated — an
 * arbitrary grid template that left the panes stacked, and btn-secondary, which does not exist.
 * Plain CSS cannot fail that way.
 *
 * WHAT IS COPIED FROM OUTLOOK: New Email top left, a command bar of REAL actions only, folders
 * down the side with counts, a list grouped by Today / This Week / Earlier with coloured
 * initials discs and unread in bold blue, and a reading pane with the sender block at the top
 * and the reply where you are already looking.
 *
 * EVERY WORD HERE WAS TYPED BY A STRANGER. React escapes text by construction, and the HTML part
 * of a received email is deliberately NOT rendered — it is kept in the archive and the plain
 * text is what you read. Nothing goes near dangerouslySetInnerHTML.
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

/** Outlook's own disc colours, so two senders are rarely the same and none is garish. */
const AVATAR_COLOURS = [
  "#0f6cbd",
  "#8764b8",
  "#c239b3",
  "#0b6a0b",
  "#986f0b",
  "#a4262c",
  "#038387",
  "#4f6bed",
];

function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

function initialsOf(name: string | null, address: string): string {
  const source = (name || address.split("@")[0] || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
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

/** Outlook's own grouping: Today, This Week, then everything older. */
function groupOf(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  if (d.toDateString() === now.toDateString()) return "Today";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return "This Week";
  if (days < 30) return "Last Month";
  return "Earlier";
}

export default function EmailClient({
  rows,
  leadNames,
  mailbox,
  actions,
}: {
  rows: EmailRow[];
  leadNames: Record<string, string>;
  mailbox: string;
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

  /** The list, cut into date groups in order, the way Outlook shows it. */
  const grouped = useMemo(() => {
    const out: Array<{ group: string; items: EmailRow[] }> = [];
    for (const r of list) {
      const g = groupOf(r.occurred_at);
      const last = out[out.length - 1];
      if (last && last.group === g) last.items.push(r);
      else out.push({ group: g, items: [r] });
    }
    return out;
  }, [list]);

  return (
    <div className="mailx">
      {/* ---------------- COMMAND BAR ---------------- */}
      <div className="mailx-bar">
        <Link href="/founder" className="mailx-back">
          ← Founder
        </Link>
        <span className="mailx-heading">Email</span>
        <span className="mailx-divider" />
        <button
          type="button"
          className="mailx-new"
          onClick={() => {
            setComposing(true);
            setSelectedId(null);
          }}
        >
          <span aria-hidden>✎</span> New Email
        </button>

        <span className="mailx-divider" />

        {/* REAL ACTIONS ONLY. A Delete or Archive button that did nothing would be worse than
            not having one at all. */}
        {selected && selected.direction === "in" ? (
          <>
            <ActionForm
              key={`bar-read-${selected.id}`}
              action={actions.setRead as never}
              hidden={{ email_id: selected.id, read: selected.is_read ? "false" : "true" }}
              label={selected.is_read ? "Mark as Unread" : "Mark as Read"}
              savedLabel="Done"
              buttonClassName="mailx-cmd"
              className=""
            />
            {!selected.body_text ? (
              <ActionForm
                key={`bar-body-${selected.id}`}
                action={actions.fetchBody as never}
                hidden={{ email_id: selected.id }}
                label="Collect content"
                savingLabel="Collecting…"
                savedLabel="Done"
                buttonClassName="mailx-cmd"
                className=""
              />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mailx-body">
        {/* ---------------- FOLDERS ---------------- */}
        <nav className="mailx-rail">
          <div className="mailx-account">{mailbox}</div>
          {(["inbox", "sent", "other"] as Folder[]).map((id) => {
            const count = folders[id].length;
            const badge = id === "inbox" ? unread : 0;
            const active = folder === id && !composing;
            return (
              <button
                key={id}
                type="button"
                className={`mailx-folder${active ? " is-active" : ""}`}
                onClick={() => {
                  setFolder(id);
                  setSelectedId(null);
                  setComposing(false);
                }}
              >
                <span>{FOLDER_LABEL[id]}</span>
                <span className={`mailx-count${badge > 0 ? " is-unread" : ""}`}>
                  {badge > 0 ? badge : count || ""}
                </span>
              </button>
            );
          })}
          <p className="mailx-note">
            Other holds bounces and out of office replies, so they do not sit in the Inbox
            looking like somebody waiting on an answer.
          </p>
        </nav>

        {/* ---------------- LIST ---------------- */}
        <div className="mailx-list">
          {list.length === 0 ? (
            <p className="mailx-empty">
              {folder === "inbox"
                ? "Nothing here. Anything sent to your address appears the moment it arrives."
                : folder === "sent"
                  ? "Nothing sent from here yet."
                  : "No bounces or automatic replies."}
            </p>
          ) : (
            grouped.map((block) => (
              <div key={block.group}>
                <div className="mailx-group">{block.group}</div>
                {block.items.map((r) => {
                  const inbound = r.direction === "in";
                  const who = inbound
                    ? r.from_name || r.from_address
                    : (r.to_addresses ?? []).join(", ") || "—";
                  const isSelected = selected?.id === r.id;
                  const isUnread = inbound && !r.is_read;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`mailx-row${isSelected ? " is-selected" : ""}${
                        isUnread ? " is-unread" : ""
                      }`}
                      onClick={() => {
                        setComposing(false);
                        setSelectedId(r.id);
                      }}
                    >
                      {isUnread ? <span className="mailx-dot" /> : null}
                      <span
                        className="mailx-avatar"
                        style={{ background: avatarColour(inbound ? r.from_address : who) }}
                      >
                        {initialsOf(inbound ? r.from_name : null, inbound ? r.from_address : who)}
                      </span>
                      <span className="mailx-rowmain">
                        <span className="mailx-rowtop">
                          <span className="mailx-from mailx-tr">{who}</span>
                          <span className="mailx-time">{whenLabel(r.occurred_at)}</span>
                        </span>
                        <span className="mailx-subject mailx-tr" style={{ display: "block" }}>
                          {r.subject || "(no subject)"}
                        </span>
                        <span className="mailx-preview mailx-tr" style={{ display: "block" }}>
                          {r.send_error
                            ? "Did not send"
                            : previewOf(withoutQuotedReply(r.body_text) || r.body_text, 70)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* ---------------- READING PANE / COMPOSE ---------------- */}
        <div className="mailx-read">
          {composing ? (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 className="mailx-title">New message</h2>
                <button type="button" className="mailx-link" onClick={() => setComposing(false)}>
                  Discard
                </button>
              </div>
              <ActionForm
                action={actions.reply as never}
                label="Send"
                savingLabel="Sending…"
                savedLabel="Sent"
                buttonClassName="mailx-send"
                className="space-y-3"
                onDone={() => setComposing(false)}
              >
                <div>
                  <label htmlFor="compose-to" className="mailx-label">
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
                  <label htmlFor="compose-subject" className="mailx-label">
                    Subject
                  </label>
                  <input
                    id="compose-subject"
                    name="subject"
                    type="text"
                    maxLength={300}
                    required
                    placeholder="What it is about"
                  />
                </div>
                <div>
                  <label htmlFor="compose-body" className="mailx-label">
                    Message
                  </label>
                  <textarea id="compose-body" name="body" rows={14} maxLength={20000} required />
                </div>
              </ActionForm>
            </section>
          ) : !selected ? (
            <p className="mailx-empty">Choose a message to read it.</p>
          ) : (
            <article>
              <h2 className="mailx-title">{selected.subject || "(no subject)"}</h2>

              <div className="mailx-who">
                <span
                  className="mailx-avatar"
                  style={{
                    width: 40,
                    height: 40,
                    flexBasis: 40,
                    fontSize: "0.8rem",
                    background: avatarColour(
                      selected.direction === "in"
                        ? selected.from_address
                        : (selected.to_addresses ?? []).join(", "),
                    ),
                  }}
                >
                  {initialsOf(
                    selected.direction === "in" ? selected.from_name : null,
                    selected.direction === "in"
                      ? selected.from_address
                      : (selected.to_addresses ?? []).join(", "),
                  )}
                </span>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {selected.direction === "in"
                      ? selected.from_name
                        ? `${selected.from_name} <${selected.from_address}>`
                        : selected.from_address
                      : mailbox}
                  </div>
                  <div className="mailx-meta">
                    To: {selected.direction === "in" ? mailbox : (selected.to_addresses ?? []).join(", ")}
                  </div>
                  <div className="mailx-meta">{fullWhen(selected.occurred_at)}</div>
                  {selected.trial_request_id && leadNames[selected.trial_request_id] ? (
                    <div className="mailx-meta">
                      Lead:{" "}
                      <Link href="/founder/trial-requests" style={{ color: "#0f6cbd" }}>
                        {leadNames[selected.trial_request_id]}
                      </Link>
                    </div>
                  ) : null}
                  {selected.send_error ? (
                    <div className="mailx-bad" style={{ fontSize: "0.8rem" }}>
                      Did not send: {selected.send_error}
                    </div>
                  ) : null}
                </div>
              </div>

              <hr className="mailx-rule" />

              {/* PLAIN TEXT ONLY — see the file header. */}
              <div className="mailx-text">
                {selected.body_text ? (
                  selected.body_text
                ) : selected.body_error ? (
                  <span className="mailx-warn">
                    The content could not be collected: {selected.body_error}
                  </span>
                ) : selected.body_html ? (
                  <span className="mailx-meta">
                    This message was sent as HTML only. The original is kept in full; there is no
                    plain text to show.
                  </span>
                ) : (
                  <span className="mailx-meta">
                    No text on this message. That can mean the sender wrote only a subject, or
                    that the content has not been collected yet.
                  </span>
                )}
              </div>

              {Array.isArray(selected.attachments) && selected.attachments.length > 0 ? (
                <p className="mailx-meta" style={{ marginTop: "0.75rem" }}>
                  {selected.attachments.length}{" "}
                  {selected.attachments.length === 1 ? "attachment" : "attachments"} — not
                  downloaded.
                </p>
              ) : null}

              {selected.direction === "in" ? (
                <>
                  <hr className="mailx-rule" />
                  <ActionForm
                    key={`reply-${selected.id}`}
                    action={actions.reply as never}
                    hidden={{
                      to: selected.from_address,
                      subject: replySubject(selected.subject),
                      reply_to_id: selected.id,
                      trial_request_id: selected.trial_request_id ?? "",
                    }}
                    label="Send"
                    savingLabel="Sending…"
                    savedLabel="Sent"
                    buttonClassName="mailx-send"
                    className="space-y-3"
                  >
                    <div>
                      <label htmlFor={`reply-body-${selected.id}`} className="mailx-label">
                        Reply to {selected.from_address}
                      </label>
                      <textarea
                        id={`reply-body-${selected.id}`}
                        name="body"
                        rows={7}
                        maxLength={20000}
                        required
                      />
                    </div>
                  </ActionForm>
                </>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
