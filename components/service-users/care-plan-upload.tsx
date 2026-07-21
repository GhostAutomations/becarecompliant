"use client";

import { useActionState, useState } from "react";
import SavedFlashMessage from "@/components/saved-flash-message";
import { uploadCarePlan, getCarePlanUrl } from "@/lib/service-users/actions";

/** Care Plan document upload + view for a service user (drill-down and Setup form). */
export default function CarePlanUpload({
  serviceUserId,
  uploadedAt,
  editable = true,
}: {
  serviceUserId: string;
  uploadedAt: string | null;
  editable?: boolean;
}) {
  const [state, action, pending] = useActionState(uploadCarePlan, {} as { ok?: string; error?: string });
  const [viewMsg, setViewMsg] = useState<string | null>(null);

  async function view() {
    setViewMsg(null);
    const res = await getCarePlanUrl(serviceUserId);
    if (res.url) window.open(res.url, "_blank", "noopener");
    else setViewMsg(res.error ?? "No care plan on file.");
  }

  const hasPlan = Boolean(uploadedAt);

  return (
    <section className="glass-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80">Care Plan</h3>
        {hasPlan ? (
          <button type="button" onClick={view} className="btn-outline px-3 py-1.5 text-xs">
            View
          </button>
        ) : null}
      </div>
      <p className="text-xs text-white/55">
        {hasPlan
          ? `On file, uploaded ${new Date(uploadedAt as string).toLocaleDateString("en-GB")}.`
          : "No care plan uploaded yet."}
      </p>
      {editable ? (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="service_user_id" value={serviceUserId} />
          <input
            type="file"
            name="care_plan"
            accept=".pdf,.doc,.docx,image/*"
            className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
          />
          <button type="submit" disabled={pending} className="btn-primary px-3 py-2 text-xs disabled:opacity-40">
            {pending ? "Uploading…" : hasPlan ? "Replace" : "Upload"}
          </button>
        </form>
      ) : null}
      <SavedFlashMessage message={state?.ok} token={state} className="text-xs text-green-300" />
      {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
      {viewMsg ? <p className="text-xs text-white/50">{viewMsg}</p> : null}
    </section>
  );
}
