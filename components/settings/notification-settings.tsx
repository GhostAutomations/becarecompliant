"use client";

/**
 * Be Care Compliant — Settings > Notifications editor (Company Admin).
 * Channel switches (daily digest email, SMS escalation opt-in), the chaser
 * thresholds, and the SMS numbers for Managers and Admins. Centrally styled
 * controls only (globals.css), no inline control styling.
 */

import { useActionState } from "react";
import { IDLE_STATE } from "@/lib/forms";
import {
  saveNotificationSettings,
  saveUserPhone,
} from "@/lib/notifications/settings-actions";

export type EscalationUser = {
  profileId: string;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
};

export default function NotificationSettings({
  initial,
  users,
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
  emailConfigured: boolean;
  smsConfigured: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveNotificationSettings,
    IDLE_STATE,
  );
  const [phoneState, phoneAction, phoneSaving] = useActionState(
    saveUserPhone,
    IDLE_STATE,
  );

  return (
    <div className="space-y-6">
      {!emailConfigured && (
        <div className="glass-card border border-amber-400/40 p-4 text-sm text-amber-200">
          Email sending is not configured on the server (RESEND_API_KEY and
          RESEND_FROM). Digests and chasers will be skipped until it is set.
        </div>
      )}

      <form action={saveAction} className="glass-card space-y-5 p-5">
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
              One 07:00 summary per Manager, Admin and Supervisor covering their
              due soon and overdue checks. Overdue chasers ride on this channel.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3">
            <input type="checkbox" name="sms_enabled" defaultChecked={initial.smsEnabled} />
            <span className="text-sm text-white/80">
              <span className="font-semibold text-white">SMS escalation</span>
              <br />
              A text to Managers and Admins when checks stay overdue. SMS is
              chargeable usage and is metered per message.
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
        {saveState.ok && <p className="text-sm text-emerald-300">{saveState.ok}</p>}
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">SMS numbers</h2>
        <p className="mt-1 text-sm text-white/60">
          Managers and Admins with a number here receive the SMS escalation.
          International format, for example +447700900123.
        </p>
        {users.length === 0 ? (
          <p className="mt-4 text-sm text-white/50">
            No Managers or Admins yet. Invite them in Users and invites.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {users.map((u) => (
              <li key={u.profileId}>
                <form action={phoneAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="profile_id" value={u.profileId} />
                  <span className="min-w-40 text-sm text-white/80">
                    <span className="font-semibold text-white">{u.fullName}</span>
                    <br />
                    <span className="text-xs text-white/50">
                      {u.role === "company_admin" ? "Admin" : "Manager"}
                    </span>
                  </span>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={u.phone ?? ""}
                    placeholder="+44…"
                    className="w-44"
                  />
                  <button
                    type="submit"
                    className="btn-outline px-3 py-1.5 text-xs"
                    disabled={phoneSaving}
                  >
                    {phoneSaving ? "Saving…" : "Save"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {phoneState.error && (
          <p className="mt-3 text-sm text-red-300">{phoneState.error}</p>
        )}
        {phoneState.ok && <p className="mt-3 text-sm text-emerald-300">{phoneState.ok}</p>}
      </section>
    </div>
  );
}
