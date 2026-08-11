import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { ukDate } from "@/lib/dates";
import { DEFAULT_RETENTION_MIN_YEARS } from "@/lib/evidence/retention";

export const metadata: Metadata = { title: "Data retention" };

/**
 * Settings > Data retention (THE LIST item 18).
 *
 * The customer is the data controller for everything in here, so the customer is who has to
 * answer an ICO question about how long they keep records. This page is that answer: what the
 * rule is, how much is counting down, what is about to go, and what is being held back.
 *
 * Read through the caller's RLS client, so the numbers are that company's and nobody else's.
 */
export default async function RetentionSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [counting, dueSoon, anonymised, heldPeople, heldServiceUsers] = await Promise.all([
    supabase
      .from("evidence")
      .select("id", { count: "exact", head: true })
      .not("retention_until", "is", null)
      .is("anonymised_at", null),
    supabase
      .from("evidence")
      .select("id", { count: "exact", head: true })
      .not("retention_until", "is", null)
      .lte("retention_until", in90)
      .is("anonymised_at", null),
    supabase
      .from("evidence")
      .select("id", { count: "exact", head: true })
      .not("anonymised_at", "is", null),
    supabase
      .from("people")
      .select("id, full_name, retention_hold_reason, retention_hold_set_at")
      .eq("retention_hold", true)
      .order("full_name"),
    supabase
      .from("service_users")
      .select("id, full_name, retention_hold_reason, retention_hold_set_at")
      .eq("retention_hold", true)
      .order("full_name"),
  ]);

  const held = [
    ...((heldPeople.data ?? []) as HeldRow[]).map((r) => ({ ...r, kind: "Person" as const, href: `/people/${r.id}` })),
    ...((heldServiceUsers.data ?? []) as HeldRow[]).map((r) => ({ ...r, kind: "Service User" as const, href: `/service-users/${r.id}` })),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />

      <div>
        <h1 className="page-title">Data retention</h1>
        <p className="page-subtitle">
          How long compliance evidence is kept, and what is due to be anonymised.
        </p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">The rule</h2>
        <p className="mt-2 text-sm text-white/70">
          Evidence is kept for at least {DEFAULT_RETENTION_MIN_YEARS} years from the end of a
          person&apos;s care: a member of staff leaving, or a service user being discharged.
          The clock only starts then, so records for people you still support or employ are
          not counted down at all.
        </p>
        <p className="mt-2 text-sm text-white/70">
          Once that date passes, the evidence is anonymised automatically overnight. The
          record of the check itself stays: what was completed, when, and on which version of
          the form. The personal detail inside it, the answers, the author and any attached
          files, is removed and cannot be recovered.
        </p>
      </section>

      <section aria-label="Retention figures" className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <p className="text-[11px] uppercase text-white/40">Counting down</p>
          <p className="mt-1 text-3xl font-bold text-white">{counting.count ?? 0}</p>
          <p className="text-sm text-white/60">records with a retention date</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-[11px] uppercase text-white/40">Due within 90 days</p>
          <p className="mt-1 text-3xl font-bold text-white">{dueSoon.count ?? 0}</p>
          <p className="text-sm text-white/60">
            {(dueSoon.count ?? 0) > 0 ? "hold anything you still need" : "nothing imminent"}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-[11px] uppercase text-white/40">Already anonymised</p>
          <p className="mt-1 text-3xl font-bold text-white">{anonymised.count ?? 0}</p>
          <p className="text-sm text-white/60">records, personal detail removed</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">On hold</h2>
        <p className="mt-1 text-sm text-white/60">
          Records held beyond their retention date, for example an ongoing tribunal or
          investigation. A hold is set on the person&apos;s own record and stays until it is
          lifted.
        </p>
        {held.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">Nothing is currently held.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {held.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                <Link href={row.href} className="text-sm text-gold-300 underline">
                  {row.full_name}
                </Link>
                <span className="ml-2 text-xs text-white/40">{row.kind}</span>
                <p className="text-xs text-white/60">
                  {row.retention_hold_reason || "No reason recorded"}
                  {row.retention_hold_set_at ? ` · held ${ukDate(row.retention_hold_set_at.slice(0, 10))}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-white/40">
        Today is {ukDate(today)}. Anonymisation runs every night and is written to your audit
        log, so you can always show what was removed and when.
      </p>
    </div>
  );
}

type HeldRow = {
  id: string;
  full_name: string;
  retention_hold_reason: string | null;
  retention_hold_set_at: string | null;
};
