"use client";

/** Clear down one alert with a reason from the list (Rota and Visits Stage 7, decision 10). */

import { useState } from "react";
import ActionForm from "@/components/rota/rota-action";
import { clearAlertAction } from "@/lib/rota/alert-actions";
import { clearReasonsFor, type AlertKind } from "@/lib/rota/alerts";

export default function AlertClearForm({ alertId, kind }: { alertId: string; kind: AlertKind }) {
  const [reason, setReason] = useState("");
  return (
    <ActionForm
      action={clearAlertAction}
      hidden={{ alert_id: alertId }}
      label="Clear down"
      savingLabel="Clearing…"
      savedLabel="Cleared"
      buttonClassName="btn-primary px-3 py-1.5 text-xs"
      className="flex flex-wrap items-end gap-2"
    >
      <select name="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" required>
        <option value="">Pick a reason…</option>
        {clearReasonsFor(kind).map((r) => (
          <option key={r.code} value={r.code}>
            {r.label}
          </option>
        ))}
      </select>
      {reason === "other" ? <input name="text" maxLength={500} required placeholder="Type the reason" aria-label="Type the reason" /> : null}
    </ActionForm>
  );
}
