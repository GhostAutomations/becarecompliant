import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import CopyLink from "@/components/public-forms/copy-link";
import { siteUrl } from "@/lib/site";
import { PUBLIC_FORM_DEFS, publicFormPath } from "@/lib/public-forms/config";
import { listPublicFormLinks } from "@/lib/public-forms/data";
import {
  createPublicLink,
  regeneratePublicLinkCode,
  setPublicLinkEnabled,
} from "@/lib/public-forms/actions";

/**
 * Settings > Public forms. A Company Admin creates the short link for a form and
 * publishes it wherever their team already looks (their own website, a WhatsApp
 * group, a poster in the office). Staff need no account and no password.
 */

export const metadata: Metadata = { title: "Public forms" };

export default async function PublicFormsSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const links = await listPublicFormLinks(profile.company_id);
  const base = siteUrl().replace(/^https?:\/\//, "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Public forms</h1>
        <p className="page-subtitle">
          Create a short link for a form and publish it where your team will see it. Anyone
          with the link can fill the form in without an account, and what they send lands in
          Be Care Compliant against their record.
        </p>
      </div>

      <section className="space-y-4">
        {PUBLIC_FORM_DEFS.map((def) => {
          const link = links.find((l) => l.form_key === def.key);
          const url = link ? `${base}${publicFormPath(link.code)}` : "";
          return (
            <div key={def.key} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{def.label}</h2>
                  <p className="mt-1 max-w-xl text-sm text-white/60">{def.blurb}</p>
                </div>
                {link ? (
                  <span className={link.enabled ? "pill-green" : "pill-neutral"}>
                    {link.enabled ? "Live" : "Switched off"}
                  </span>
                ) : (
                  <span className="pill-neutral">Not published</span>
                )}
              </div>

              {link ? (
                <div className="mt-4 space-y-3">
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white">
                    {url}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyLink url={`https://${url}`} />
                    <ActionForm
                      action={setPublicLinkEnabled}
                      hidden={{ form_key: def.key, enabled: link.enabled ? "false" : "true" }}
                      label={link.enabled ? "Switch off" : "Switch on"}
                      savedLabel="Saved"
                      buttonClassName="btn-outline px-3 py-2 text-xs"
                      className=""
                      confirm={
                        link.enabled
                          ? "Switch this link off? Anyone who opens it will be told the form is not available."
                          : undefined
                      }
                    />
                    <ActionForm
                      action={regeneratePublicLinkCode}
                      hidden={{ form_key: def.key }}
                      label="New link"
                      savedLabel="Issued"
                      buttonClassName="btn-outline px-3 py-2 text-xs"
                      className=""
                      confirm="Issue a new link? Every copy of the current link stops working straight away, so you will need to republish it."
                    />
                  </div>
                  <p className="text-xs text-white/45">
                    Submissions arrive in People, Submissions. One that we cannot match to a
                    record waits there for you to link it.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <ActionForm
                    action={createPublicLink}
                    hidden={{ form_key: def.key }}
                    label="Create link"
                    savedLabel="Created"
                    className=""
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
