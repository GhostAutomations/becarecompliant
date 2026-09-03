import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import { sendInboxReply, setEmailRead } from "@/app/(app)/founder/actions";
import { previewOf, withoutQuotedReply, replySubject } from "@/lib/founder/inbox";
import { formatReceivedAt } from "@/lib/founder/trial-requests";

/**
 * Founder > Inbox. Everything the platform has received or sent.
 *
 * WHY IT EXISTS. Until 2026-09-03 Be Care Compliant could send and could not receive:
 * becarecompliant.com had no MX record, and the trial acknowledgement ended "just reply to this
 * email" from a no-reply address. Anyone who replied vanished. Two real care companies were told
 * that on 27 August.
 *
 * THE ARCHIVE IS THIS TABLE, NOT RESEND. Resend keeps received mail for 30 days on every plan,
 * Pro included. What is here is the permanent record.
 *
 * EVERY WORD ON THIS PAGE WAS TYPED BY A STRANGER. Sender, subject and body all arrive from the
 * open internet. They are rendered as ordinary React text, which escapes by construction. The
 * HTML part of a received email IS stored — it is part of the record — and is deliberately NOT
 * rendered: nothing here goes near dangerouslySetInnerHTML, and the plain text part is what you
 * read. That is the same rule the trial requests page follows.
 */

export const metadata: Metadata = { title: "Inbox" };

type EmailRow = {
  id: string;
  direction: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: unknown;
  trial_request_id: string | null;
  is_read: boolean;
  is_spam: boolean;
  send_error: string | null;
  occurred_at: string;
};

export default async function FounderInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requirePlatformAdmin();
  const { show } = await searchParams;
  const showAutomated = show === "automated";

  const supabase = await createClient();

  const [{ data }, { data: leads }] = await Promise.all([
    supabase
      .from("founder_emails")
      .select(
        "id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, attachments, trial_request_id, is_read, is_spam, send_error, occurred_at",
      )
      .eq("is_spam", showAutomated)
      .order("occurred_at", { ascending: false })
      .limit(300),
    supabase.from("trial_requests").select("id, company_name"),
  ]);

  const rows = (data ?? []) as EmailRow[];
  const leadName = new Map(
    ((leads ?? []) as Array<{ id: string; company_name: string }>).map((l) => [l.id, l.company_name]),
  );

  const waiting = rows.filter((r) => r.direction === "in" && !r.is_read).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Inbox</h1>
        <p className="page-subtitle">
          Every email the platform has received or sent, newest first, kept here for good. Replies
          from this screen go out from your own address and land in the same thread the person
          started.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-white/60">
          {rows.length} {rows.length === 1 ? "message" : "messages"}
          {waiting > 0 ? (
            <>
              {" · "}
              <span className="text-amber-300">{waiting} waiting on you</span>
            </>
          ) : null}
        </span>
        <Link
          href={showAutomated ? "/founder/inbox" : "/founder/inbox?show=automated"}
          className="text-xs underline decoration-white/30 hover:text-white"
        >
          {showAutomated ? "Back to real messages" : "Show bounces and auto-replies"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm text-white/60">
            {showAutomated
              ? "No bounces or automatic replies."
              : "Nothing yet. Anything sent to your receiving address appears here the moment it arrives."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const inbound = r.direction === "in";
            const who = inbound
              ? r.from_name || r.from_address
              : (r.to_addresses ?? []).join(", ");
            const body = withoutQuotedReply(r.body_text) || (r.body_text ?? "");

            return (
              <section key={r.id} className="glass-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={inbound ? "pill pill-green" : "pill pill-neutral"}>
                        {inbound ? "Received" : "Sent"}
                      </span>
                      {inbound && !r.is_read ? (
                        <span className="pill pill-amber">Waiting on you</span>
                      ) : null}
                      {r.send_error ? <span className="pill pill-red">Did not send</span> : null}
                      {r.trial_request_id && leadName.get(r.trial_request_id) ? (
                        <Link
                          href="/founder/trial-requests"
                          className="text-xs underline decoration-white/30 hover:text-white"
                        >
                          {leadName.get(r.trial_request_id)}
                        </Link>
                      ) : null}
                    </div>
                    <h2 className="mt-2 truncate text-base font-semibold text-white">
                      {r.subject || "(no subject)"}
                    </h2>
                    <p className="truncate text-sm text-white/60">
                      {inbound ? "From" : "To"} {who} · {formatReceivedAt(r.occurred_at)}
                    </p>
                  </div>
                </div>

                {/* PLAIN TEXT ONLY. The HTML part is stored but never rendered — see the header. */}
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="whitespace-pre-wrap text-sm text-white/80">
                    {body || previewOf(null)}
                  </p>
                  {!r.body_text && r.body_html ? (
                    <p className="mt-2 text-xs text-white/40">
                      This message was sent as HTML only, so there is no plain text to show. The
                      original is kept in full.
                    </p>
                  ) : null}
                </div>

                {Array.isArray(r.attachments) && r.attachments.length > 0 ? (
                  <p className="mt-2 text-xs text-white/50">
                    {r.attachments.length}{" "}
                    {r.attachments.length === 1 ? "attachment" : "attachments"} — not downloaded.
                  </p>
                ) : null}

                {r.send_error ? (
                  <p className="mt-2 text-xs text-red-300">{r.send_error}</p>
                ) : null}

                {inbound ? (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <ActionForm
                      action={sendInboxReply}
                      hidden={{
                        to: r.from_address,
                        subject: replySubject(r.subject),
                        reply_to_id: r.id,
                        trial_request_id: r.trial_request_id ?? "",
                      }}
                      label="Send reply"
                      savingLabel="Sending…"
                      savedLabel="Sent"
                      className="space-y-3"
                    >
                      <div>
                        <label htmlFor={`body-${r.id}`} className="form-label">
                          Reply to {r.from_address}
                        </label>
                        <textarea
                          id={`body-${r.id}`}
                          name="body"
                          rows={5}
                          maxLength={20000}
                          required
                          placeholder="Write your reply. It goes out from your own address and stays on this thread."
                        />
                      </div>
                    </ActionForm>

                    <ActionForm
                      action={setEmailRead}
                      hidden={{ email_id: r.id, read: r.is_read ? "false" : "true" }}
                      label={r.is_read ? "Put back" : "Mark as done"}
                      savedLabel="Saved"
                    />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
