"use client";

/**
 * Be Care Compliant: My signature (Phil, 2026-10-12, Job 2 Part A,
 * docs/decisions/letter-signatures.md). Two signatures to keep: an image uploaded (a photo or scan
 * of it), and one drawn on screen. Each saves on its own and can be removed. Only you ever see them.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/components/reg73/signature-pad";
import { IDLE_STATE } from "@/lib/forms";
import { useSavedFlash } from "@/lib/use-saved-flash";
import { submitKeepingTyped } from "@/components/forms/keep-typed";
import { removeSignature, saveDrawnSignature, saveUploadedSignature } from "@/lib/letters/signature-actions";

type Saved = { url: string; savedAt: string } | null;

function savedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

function RemoveButton({ kind }: { kind: "upload" | "drawn" }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(removeSignature, IDLE_STATE);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form onSubmit={submitKeepingTyped(action)} className="flex items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" disabled={pending} className="btn-outline px-3 py-1.5 text-xs">
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.error ? <span className="text-xs text-red-300">{state.error}</span> : null}
    </form>
  );
}

function Current({ saved, kind }: { saved: Saved; kind: "upload" | "drawn" }) {
  if (!saved) return <p className="text-sm text-white/50">None saved yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={saved.url} alt="Your saved signature" className="h-16 max-w-[16rem] rounded-lg bg-white object-contain p-1" />
      <span className="text-xs text-white/50">Saved {savedOn(saved.savedAt)}</span>
      <RemoveButton kind={kind} />
    </div>
  );
}

export default function MySignatureForm({ upload, drawn }: { upload: Saved; drawn: Saved }) {
  const router = useRouter();

  const [upState, upAction, upPending] = useActionState(saveUploadedSignature, IDLE_STATE);
  const [upSaved, upFlash, upReset] = useSavedFlash();
  useEffect(() => {
    if (upState.ok && !upPending) {
      upFlash();
      router.refresh();
    }
  }, [upState, upPending, upFlash, router]);

  const [drState, drAction, drPending] = useActionState(saveDrawnSignature, IDLE_STATE);
  const [drSaved, drFlash, drReset] = useSavedFlash();
  const [drawnNow, setDrawnNow] = useState("");
  useEffect(() => {
    if (drState.ok && !drPending) {
      drFlash();
      router.refresh();
    }
  }, [drState, drPending, drFlash, router]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass-card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Uploaded signature</h2>
          <p className="mt-1 text-xs text-white/60">
            A photo or scan of your signature on white paper, as a PNG or JPEG under 1MB. Crop it close to the
            signature so it sits neatly above your name.
          </p>
        </div>
        <Current saved={upload} kind="upload" />
        <form onSubmit={submitKeepingTyped(upAction)} onChange={upReset} className="space-y-3">
          <input type="file" name="signature_file" accept="image/png,image/jpeg" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={upPending} className={upSaved ? "btn-saved" : "btn-primary"}>
              {upPending ? "Saving…" : upSaved ? "Saved" : upload ? "Replace" : "Save"}
            </button>
            {upState.error ? <span className="text-xs text-red-300">{upState.error}</span> : null}
          </div>
        </form>
      </section>

      <section className="glass-card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Drawn signature</h2>
          <p className="mt-1 text-xs text-white/60">
            Draw your signature in the box with your finger, a stylus or the mouse, then save it.
          </p>
        </div>
        <Current saved={drawn} kind="drawn" />
        <form onSubmit={submitKeepingTyped(drAction)} className="space-y-3">
          <SignaturePad
            name="signature_drawn"
            onChange={(url) => {
              setDrawnNow(url);
              drReset();
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={drPending || !drawnNow} className={drSaved ? "btn-saved" : "btn-primary"}>
              {drPending ? "Saving…" : drSaved ? "Saved" : drawn ? "Replace" : "Save"}
            </button>
            {drState.error ? <span className="text-xs text-red-300">{drState.error}</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
