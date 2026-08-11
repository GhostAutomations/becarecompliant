"use client";

/**
 * Be Care Compliant — Settings > Notifications editor (Company Admin).
 * Channel switches (daily digest email, SMS escalation opt-in), the chaser
 * thresholds, and the SMS numbers for Managers, Admins and Registered roles. Centrally styled
 * controls only (globals.css), no inline control styling.
 */

import { useActionState, useEffect } from "react";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import {
  saveNotificationSettings,
  saveUserPhone,
} from "@/lib/notifications/settings-actions";

/** Roles that can be an SMS/notification recipient, with their display labels. */
const ROLE_LABEL: Record<string, string> = {
  company_admin: "Admin",
  registered_individual: "Registered Individual",
  registered_manager: "Registered Manager",
  manager: "Branch Manager",
  supervisor: "Supervisor",
};

export type EscalationUser = {
  profileId: string;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
  /** True when this number has replied STOP. Only they can undo it, by replying START. */
  optedOut: boolean;
};

/** One inbound text, already formatted on the server so the list cannot hydrate differently. */
export type SmsReply = {
  id: string;
  fromNumber: string;
  senderName: string | null;
  body: string;
  keyword: string | null;
  receivedAt: string;
};

export default function NotificationSettings({
  initial,
  users,
  replies,
  emailConfigured,
  smsConfigured,
}: {
  initial: {
    emailDigestEnabled: boolean;
    smsEnabled: boolean;
    chaserFirstDays: number;
    chaserSecondDays: number;
    smsOverdueDays: number;
  };
  users: EscalationUser[];
  replies: SmsReply[];
  emailConfigured: boolean;
  smsConfigured: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveNotificationSettings,
    IDLE_STATE,
  );
  const [savedMain, flashMain, resetMain] = useSavedFlash();
  useEffect(() => { if (saveState.ok && !saving) flashMain(); }, [saveState, saving, flashMain]);

  return (
    <div className="space-y-6">
      {!emailConfigured && (
        <div className="glass-card border border-amber-400/40 p-4 text-sm text-amber-200">
          Email sending is not configured on the server (RESEND_API_KEY and
          RESEND_FROM). Digests and chasers will be skipped until it is set.
        </div>
      )}

      <form action={saveAction} className="glass-card space-y-5 p-5" onChange={resetMain}>
        <div>
          <h2 className="text-sm font-semibold text-white/80">Channels</h2>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              name="email_digest_enabled"
              defaultChecked={initial.emailDigestEnabled}
            />
            <span className="text-sm text-white/80">
              <span className="font-semibold text-white">Daily digest email</span>
              <br />
              One 07:00 summary per Manager, Admin, Registered role and Supervisor covering their
              due soon and overdue checks. Overdue chasers ride on this channel.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3">
            <input type="checkbox" name="sms_enabled" defaultChecked={initial.smsEnabled} />
            <span className="text-sm text-white/80">
              <span className="font-semibold text-white">SMS escalation</span>
              <br />
              A text to Managers, Admins and Registered roles when checks stay overdue. Each text uses one of your
              monthly SMS allowance, and when that allowance runs out we STOP sending texts rather
              than billing you for more. Your balance and top ups are in Billing. Email escalation
              carries on either way.
              {!smsConfigured && (
                <span className="block text-amber-300/90">
                  SMS sending is not configured on the server yet, so texts will be
                  skipped until it is set up.
                </span>
              )}
            </span>
          </label>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white/80">Escalation timing</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm text-white/70">
              First chaser (days overdue)
              <input
                type="number"
                name="chaser_first_days"
                min={1}
                max={365}
                defaultValue={initial.chaserFirstDays}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-sm text-white/70">
              Second chaser (days overdue)
              <input
                type="number"
                name="chaser_second_days"
                min={1}
                max={365}
                defaultValue={initial.chaserSecondDays}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-sm text-white/70">
              SMS at (days overdue)
              <input
                type="number"
                name="sms_overdue_days"
                min={1}
                max={365}
                defaultValue={initial.smsOverdueDays}
                className="mt-1 w-full"
              />
            </label>
          </div>
        </div>

        {saveState.error && (
          <p className="text-sm text-red-300">{saveState.error}</p>
        )}
        <button type="submit" className={`${savedMain ? "btn-saved" : "btn-primary"} px-4 py-2 text-sm`} disabled={saving}>
          {saving ? "Saving…" : savedMain ? "Saved" : "Save settings"}
        </button>
      </form>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">SMS numbers</h2>
        <p className="mt-1 text-sm text-white/60">
          Managers, Admins and Registered roles with a number here receive the SMS escalation. Enter
          a UK mobile as you would dial it, for example 07700 900123: it is stored
          in international format (+44) for sending.
        </p>
        {users.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">
            No recipients yet. Invite Managers, Admins or Registered roles in Users and invites.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {users.map((u) => (
              <PhoneRow key={u.profileId} u={u} />
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Replies</h2>
        <p className="mt-1 text-sm text-white/60">
          Texts sent back to our number by your Managers, Admins and Registered roles, newest first. Anyone can
          reply STOP to stop receiving texts and START to begin again, and we act on that the
          moment it arrives.
        </p>
        {replies.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">No replies yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {replies.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-white">
                    {r.senderName ?? r.fromNumber}
                  </span>
                  <span className="text-xs text-white/45">{r.receivedAt}</span>
                </div>
                <p className="mt-1 text-sm text-white/75">{r.body || "(no message)"}</p>
                {r.keyword && (
                  <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/60">
                    {r.keyword}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One SMS-number row with its own save state, so only the saved row turns green. */
function PhoneRow({ u }: { u: EscalationUser }) {
  const [state, action, saving] = useActionState(saveUserPhone, IDLE_STATE);
  const [saved, flash, reset] = useSavedFlash();
  useEffect(() => { if (state.ok && !saving) flash(); }, [state, saving, flash]);
  return (
    <li>
      <form action={action} className="flex flex-wrap items-center gap-3" onChange={reset}>
        <input type="hidden" name="profile_id" value={u.profileId} />
        <span className="min-w-40 text-sm text-white/80">
          <span className="font-semibold text-white">{u.fullName}</span>
          <br />
          <span className="text-xs text-white/50">
            {ROLE_LABEL[u.role] ?? u.role}
          </span>
        </span>
        <input
          type="tel"
          name="phone"
          defaultValue={u.phone ?? ""}
          placeholder="07700 900123"
          className="w-44"
        />
        <button
          type="submit"
          className={`${saved ? "btn-saved" : "btn-primary"} px-3 py-1.5 text-xs`}
          disabled={saving}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        {state.error && <span className="text-xs text-red-300">{state.error}</span>}
      </form>
      {u.optedOut && (
        <p className="mt-1 text-xs text-amber-300/90">
          This number replied STOP, so it receives no texts. Only they can undo that, by replying
          START to our number.
        </p>
      )}
    </li>
  );
}
