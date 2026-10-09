import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/admin";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import LocationChooser from "@/components/cloud/location-chooser";
import CopyProgress from "@/components/cloud/copy-progress";
import { cloudProgress } from "@/lib/cloud/progress";
import { getCloudConnection } from "@/lib/cloud/connection";
import { microsoftConfigured } from "@/lib/cloud/microsoft";
import { cloudKeyConfigured } from "@/lib/cloud/crypto";
import { changeCloudLocation, copyEverythingSoFar, disconnectCloud, retryCloudFailures } from "@/lib/cloud/actions";

export const metadata: Metadata = { title: "Cloud drive" };
export const dynamic = "force-dynamic";

/**
 * Settings > Cloud drive (0437, Phil 2026-10-08): a copy of every PDF and certificate in the
 * company's own Microsoft 365, OneDrive or a SharePoint site, in a "Be Care Compliant" folder with
 * a folder per branch and, inside it, per person and service user. Admins only.
 */

const ERRORS: Record<string, string> = {
  not_set_up: "Cloud drive copies are not switched on for Be Care Compliant yet. Please contact support.",
  cancelled: "Microsoft sign in was cancelled, so nothing was connected.",
  needs_admin:
    "Your company's Microsoft 365 needs an IT administrator to approve Be Care Compliant first. Ask them to press Connect and sign in, and tick \"Consent on behalf of your organisation\". After that anyone with access can connect.",
  expired: "That sign in took too long or came back to a different login. Please press Connect again.",
  failed: "Microsoft did not finish connecting. Please try again.",
  company: "Choose a company first.",
  support: "Support mode does not connect a company's cloud drive or choose where it copies to. Ask an Admin at the company, or exit support mode.",
};

function when(iso: string | null): string {
  if (!iso) return "Not yet";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export default async function CloudSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");
  const sp = await searchParams;
  const configured = microsoftConfigured() && cloudKeyConfigured();
  const c = await getCloudConnection(profile.company_id);

  const db = createServiceClient();
  const [progress, failures] = await Promise.all([
    cloudProgress(profile.company_id),
    db
      .from("cloud_sync_queue")
      .select("id, source_kind, last_error, created_at")
      .eq("company_id", profile.company_id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const status = !c || c.status === "disconnected" ? "none" : c.status === "needs_reconnect" ? "reconnect" : c.drive_id ? "ready" : "choose";

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/settings" label="Settings" />
      <div>
        <h1 className="page-title">Cloud drive</h1>
        <p className="page-subtitle">
          Keep a copy of every completed form, certificate, letter and policy in your own Microsoft 365, in a
          folder for each person and service user. Be Care Compliant stays the record; your drive gets a copy.
        </p>
      </div>

      {sp.error ? <div className="glass-card border border-red-400/30 p-4 text-sm text-red-200">{ERRORS[sp.error] ?? ERRORS.failed}</div> : null}
      {sp.connected && status === "choose" ? (
        <div className="glass-card border border-emerald-400/30 p-4 text-sm text-emerald-200">
          Microsoft 365 is connected. Now choose where the Be Care Compliant folder should live.
        </div>
      ) : null}

      {!configured ? (
        <div className="glass-card p-5 text-sm text-amber-200">
          Cloud drive copies are not switched on for Be Care Compliant yet (the Microsoft app keys are not set).
        </div>
      ) : null}

      {status === "none" ? (
        <section className="glass-card space-y-3 p-5">
          <h2 className="text-base font-semibold text-white">Connect Microsoft 365</h2>
          <p className="text-sm text-white/70">
            You sign in on Microsoft&apos;s own screen and approve access. Be Care Compliant never sees your password,
            and can only reach what your Microsoft login can reach. You can disconnect at any time.
          </p>
          <p className="text-sm text-white/70">
            Once a file is copied into your drive it is yours to look after. Be Care Compliant&apos;s retention,
            anonymising and deleting do not reach copies already in your drive, so keep the folder&apos;s access to the
            people who should see staff and service user records.
          </p>
          {configured ? (
            <a href="/api/cloud/microsoft/start" className="btn-primary inline-flex px-4 py-2 text-sm">
              Connect Microsoft 365
            </a>
          ) : null}
          <p className="form-hint">Google Drive is coming next.</p>
        </section>
      ) : null}

      {status === "reconnect" ? (
        <section className="glass-card space-y-3 border border-red-400/30 p-5">
          <h2 className="text-base font-semibold text-red-200">Copying has stopped: connect again</h2>
          <p className="text-sm text-white/70">
            Microsoft stopped accepting the connection made by {c?.account_name || c?.account_email || "your Admin"}. This
            usually means their password changed, they left, or their access was removed. Nothing is lost:{" "}
            {progress.waiting} {progress.waiting === 1 ? "copy is" : "copies are"} waiting and will go across once you connect again.
          </p>
          {c?.last_error ? <p className="text-xs text-white/45">Microsoft said: {c.last_error}</p> : null}
          {configured ? (
            <a href="/api/cloud/microsoft/start" className="btn-primary inline-flex px-4 py-2 text-sm">
              Connect again
            </a>
          ) : null}
        </section>
      ) : null}

      {status === "choose" ? (
        <section className="glass-card space-y-3 p-5">
          <h2 className="text-base font-semibold text-white">Where should the folder live?</h2>
          <p className="text-sm text-white/60">
            Connected as {c?.account_name || c?.account_email}. A folder called Be Care Compliant is made there, with
            People, Service Users, Complaints, Incidents, Policies and Briefings inside. People and Service Users
            have a folder for each branch, with each person or service user inside their branch.
          </p>
          <LocationChooser />
          <p className="text-xs text-white/50">
            Wrong account?{" "}
            <a href="/api/cloud/microsoft/start" className="text-gold-300 hover:underline">
              Connect a different account
            </a>
          </p>
        </section>
      ) : null}

      {status === "ready" && c ? (
        <>
          <section className="glass-card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Connected</h2>
                <p className="text-sm text-white/60">
                  Copies go to {c.location_kind === "onedrive" ? "OneDrive" : c.site_name || "your SharePoint site"}, in the Be Care
                  Compliant folder. Connected by {c.account_name || c.account_email} on {when(c.connected_at)}.
                </p>
              </div>
              {c.root_folder_url ? (
                <a href={c.root_folder_url} target="_blank" rel="noopener noreferrer" className="btn-outline btn-xs">
                  Open the folder
                </a>
              ) : null}
            </div>
            <CopyProgress initial={progress} />
            {(failures.data ?? []).length > 0 ? (
              <ul className="space-y-1 text-xs text-red-200/80">
                {(failures.data as Array<{ id: string; last_error: string | null }>).map((f) => (
                  <li key={f.id}>{f.last_error ?? "Failed"}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {progress.failed > 0 || progress.waiting > 0 ? (
                <ActionForm action={retryCloudFailures} label="Try again now" savedLabel="Done" buttonClassName="btn-outline btn-xs" className="" />
              ) : null}
            </div>
          </section>

          <section className="glass-card space-y-3 p-5">
            <h2 className="text-base font-semibold text-white">Copy everything so far</h2>
            <p className="text-sm text-white/60">
              New documents are copied as they happen. Press this once to copy everything you already have: every
              completed form, uploaded file, certificate, letter, policy version and memo, and a folder for every
              current person and service user, inside their branch, with a folder inside it for each check and for
              Holiday, Absence, Training and Documents. It runs in the background; the bar above shows how far it has got and the time left.
              Pressing it again never makes duplicates.
            </p>
            <ActionForm
              action={copyEverythingSoFar}
              label="Copy everything so far"
              savedLabel="Started"
              buttonClassName="btn-outline btn-xs"
              className=""
              confirm="Copy everything Be Care Compliant already holds into your drive? It runs in the background."
            />
          </section>

          <section className="glass-card space-y-3 p-5">
            <h2 className="text-base font-semibold text-white">Change or stop</h2>
            <p className="text-sm text-white/60">
              Disconnecting stops new copies and removes Be Care Compliant&apos;s access. Files already copied stay in your drive.
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionForm
                action={changeCloudLocation}
                label="Change where the folder lives"
                savedLabel="Choose below"
                buttonClassName="btn-outline btn-xs"
                className=""
                confirm="Choose a different place for the Be Care Compliant folder? Files already copied stay where they are."
              />
              <a href="/api/cloud/microsoft/start" className="btn-outline btn-xs">
                Connect a different account
              </a>
              <ActionForm
                action={disconnectCloud}
                label="Disconnect"
                savedLabel="Disconnected"
                buttonClassName="btn-outline btn-xs"
                className=""
                confirm="Stop copying documents to your drive? Files already copied stay where they are."
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
