"use client";

/**
 * Be Care Compliant — Add action on the Readiness page's outstanding checks (snag S13, Phil 2 Oct:
 * "does add action need to take you to the dash?"). Opens the record's Updates thread over the
 * Readiness page, with the new update already linked to the check, so a manager writes why it is
 * late and stays where they were. Posting closes it and redraws Readiness, so the pill moves.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UpdatesDialog } from "@/components/updates/updates-tile";
import { loadRecordUpdates } from "@/lib/updates/actions";
import type { RecordUpdates } from "@/lib/updates/types";

type Loaded = { data: RecordUpdates; currentUserId: string; canRemove: boolean };

export default function AddAction({
  kind,
  recordId,
  recordName,
  about,
}: {
  kind: "person" | "service_user";
  recordId: string;
  recordName: string;
  /** The check or tracker the update is about (lib/updates/about.ts). */
  about: string;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<boolean> {
    const res = await loadRecordUpdates({ kind, recordId });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setLoaded({ data: res.data, currentUserId: res.currentUserId, canRemove: res.canRemove });
    return true;
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await load()) setOpen(true);
    } catch (e) {
      setError(`The updates could not be opened: ${(e as Error).message}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  // Only a choice this record offers is taken, the same rule as the record page's ?about= link.
  const startAbout = loaded && loaded.data.aboutChoices.some((c) => c.value === about) ? about : "";

  return (
    <>
      <button type="button" className="btn-outline btn-xs shrink-0 whitespace-nowrap" onClick={start} disabled={busy} aria-haspopup="dialog">
        {busy ? "Opening…" : "Add action"}
      </button>
      {error ? <span className="form-error shrink-0 text-xs">{error}</span> : null}
      {loaded ? (
        <UpdatesDialog
          kind={kind}
          recordId={recordId}
          data={loaded.data}
          currentUserId={loaded.currentUserId}
          canRemove={loaded.canRemove}
          open={open}
          onClose={() => setOpen(false)}
          startAbout={startAbout}
          label={`Updates on ${recordName}${loaded.data.count > 0 ? ` (${loaded.data.count})` : ""}`}
          onPosted={() => {
            setOpen(false);
            router.refresh();
          }}
          onChanged={() => {
            void load().catch(() => {});
          }}
        />
      ) : null}
    </>
  );
}
