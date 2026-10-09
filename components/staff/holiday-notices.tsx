"use client";

/**
 * Be Care Compliant — what the office has done to a carer's holiday, at the top of My area.
 *
 * Phil, 2026-10-09 (popup): when the office changes or cancels a carer's holiday, or decides a
 * change or cancellation they asked for, the portal tells them as well as the email, and the
 * notice stays until they press Got it. Laid out like "Questions from your manager", which is the
 * other thing their manager puts at the top of this page.
 */

import ActionForm from "@/components/action-form";
import { dismissHolidayNotice } from "@/lib/holidays/actions";
import { noticeByLine, noticeLine, noticeTitle, type HolidayNotice } from "@/lib/holidays/changes";

export default function HolidayNotices({ notices }: { notices: HolidayNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <section className="glass-card border border-amber-400/30 p-5" aria-live="polite">
      <p className="text-lg font-semibold text-white">
        {notices.length === 1 ? "A change to your holiday" : "Changes to your holidays"}
      </p>
      <ul className="mt-3 space-y-3">
        {notices.map((n) => (
          <li key={n.id} className="rounded-xl bg-white/5 p-4">
            <p className="text-sm font-semibold text-white">{noticeTitle(n.kind)}</p>
            <p className="mt-1 text-sm text-white/75">{noticeLine(n)}</p>
            {n.reason ? <p className="mt-1 text-sm text-white/75">Reason: {n.reason}</p> : null}
            <p className="mt-1 text-xs text-white/45">{noticeByLine(n.actor_name, n.created_at)}</p>
            <div className="mt-3">
              <ActionForm
                action={dismissHolidayNotice}
                hidden={{ event_id: n.id }}
                label="Got it"
                savedLabel="Done"
                buttonClassName="btn-primary px-3 py-1.5 text-xs"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
