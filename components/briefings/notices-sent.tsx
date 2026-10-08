/**
 * Be Care Compliant — the memos, messages and attachments that have been sent (0435), one row
 * each, with how many have read, confirmed or signed, the live "who has responded" PDF, the memo
 * PDF, and withdraw for everyone still to do it. Per person withdraw stays on the Outstanding list.
 */

import ActionForm from "@/components/action-form";
import NoticeText from "@/components/briefings/notice-text";
import { withdrawNotice } from "@/lib/briefings/notice-actions";
import type { AssignmentRow } from "@/lib/assignments/types";
import {
  NOTICE_KIND_LABELS,
  NOTICE_RESPONSE_ASKS,
  NOTICE_RESPONSE_DONE,
  type NoticeKind,
  type NoticeResponse,
} from "@/lib/briefings/notice-rules";

type Sent = {
  noticeId: string;
  title: string;
  kind: NoticeKind | null;
  response: NoticeResponse | null;
  files: number;
  fileNames: string[];
  body: string | null;
  sent: number;
  done: number;
  opened: number;
  open: number;
  sentAt: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export default function NoticesSent({ assignments }: { assignments: AssignmentRow[] }) {
  const byNotice = new Map<string, Sent>();
  for (const a of assignments) {
    if (a.kind !== "notice" || !a.notice_id || a.status === "cancelled") continue;
    const s =
      byNotice.get(a.notice_id) ??
      ({
        noticeId: a.notice_id,
        title: a.title,
        kind: a.notice_kind,
        response: a.notice_response,
        files: a.notice_files.length,
        fileNames: a.notice_files.map((f) => f.name),
        body: a.notice_body,
        sent: 0,
        done: 0,
        opened: 0,
        open: 0,
        sentAt: a.assigned_at,
      } satisfies Sent);
    s.sent += 1;
    if (a.status === "completed") s.done += 1;
    else s.open += 1;
    if (a.read_at) s.opened += 1;
    if (a.assigned_at < s.sentAt) s.sentAt = a.assigned_at;
    byNotice.set(a.notice_id, s);
  }
  const rows = [...byNotice.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
        Memos and messages sent ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <div className="glass-card p-5 text-sm text-white/60">
          Nothing sent yet. Use Send a memo or message to send the team a memo, a short message
          or some documents.
        </div>
      ) : (
        <div className="glass-card divide-y divide-white/10">
          {rows.map((r) => {
            const label = r.kind ? NOTICE_KIND_LABELS[r.kind] : "Briefing";
            const ask = r.response ? NOTICE_RESPONSE_ASKS[r.response].toLowerCase() : "to read";
            const doneWord = r.response ? NOTICE_RESPONSE_DONE[r.response].toLowerCase() : "read";
            const allDone = r.open === 0;
            return (
              <div key={r.noticeId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                  <p className="text-xs text-white/50">
                    {label} {ask}
                    {r.files > 0 ? ` · ${r.files} ${r.files === 1 ? "file" : "files"}` : ""} · Sent{" "}
                    {fmt(r.sentAt)}
                  </p>
                  {r.body || r.fileNames.length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-white/60">What was sent</summary>
                      {r.body ? (
                        <div className="mt-2 max-w-prose">
                          <NoticeText body={r.body} compact />
                        </div>
                      ) : null}
                      {r.fileNames.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {r.fileNames.map((name, i) => (
                            <li key={i}>
                              <a
                                href={`/api/briefings/notices/${r.noticeId}/files/${i + 1}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-amber-200 underline decoration-white/30 underline-offset-2"
                              >
                                {name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={allDone ? "pill pill-green" : "pill pill-neutral"}>
                    {r.done} of {r.sent} {doneWord}
                  </span>
                  {r.response !== "read" ? (
                    <span className="pill pill-neutral">{r.opened} opened</span>
                  ) : null}
                  <a
                    href={`/api/briefings/report?notice=${r.noticeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline px-3 py-2 text-xs"
                  >
                    Who has responded
                  </a>
                  {r.kind === "memo" ? (
                    <a
                      href={`/api/briefings/notices/${r.noticeId}/memo`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-3 py-2 text-xs"
                    >
                      Memo PDF
                    </a>
                  ) : null}
                  {r.open > 0 ? (
                    <ActionForm
                      action={withdrawNotice}
                      hidden={{ notice_id: r.noticeId }}
                      label="Withdraw"
                      savedLabel="Withdrawn"
                      buttonClassName="btn-ghost px-3 py-2 text-xs"
                      className=""
                      confirm={`Withdraw this from the ${r.open} ${r.open === 1 ? "person" : "people"} who have not done it yet? It disappears from their list.`}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
