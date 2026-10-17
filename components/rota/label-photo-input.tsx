"use client";

/**
 * Be Care Compliant: the photo of the pharmacy label or prescription for a MAR medicine (Rota and
 * Visits Stage 6, Phil's popups 2026-10-17). On a phone the camera opens; the photo is shrunk in
 * the browser (lib/images/shrink.ts) and travels with the form as a JPEG data URL, so the server
 * stores it privately at the moment the medicine is saved. No photo needs a reason, which the
 * second checker sees.
 */

import { useState } from "react";
import { shrinkImageFile } from "@/lib/images/shrink";

const MAX_BYTES = 3 * 1024 * 1024;

export default function LabelPhotoInput({ keepFrom }: { keepFrom?: string } = {}) {
  const [keep, setKeep] = useState(Boolean(keepFrom));
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [none, setNone] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const small = await shrinkImageFile(file, 1600, 0.8);
      if (!/^image\/(jpeg|png)$/.test(small.type)) throw new Error("type");
      if (small.size > MAX_BYTES) throw new Error("size");
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(small);
      });
      setPhoto(url);
      setNone(false);
    } catch (x) {
      setErr((x as Error).message === "size" ? "That photo is too big. Try again closer to the label." : "That file could not be used. Take a photo or choose a JPEG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-2 rounded-lg border border-white/10 p-3">
      <legend className="px-1 text-xs text-white/70">Photo of the pharmacy label or prescription</legend>
      <p className="text-xs text-white/55">The second checker compares what you enter against this photo.</p>
      <input type="hidden" name="label_photo" value={photo} />
      <input type="hidden" name="label_keep_from" value={keep && keepFrom && !photo ? keepFrom : ""} />
      {keep && keepFrom && !photo ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/rota/mar-label/${keepFrom}`} alt="The photo already attached" className="h-24 w-auto rounded border border-white/10 bg-white" />
          <span className="text-xs text-white/70">Using the photo already attached.</span>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setKeep(false)}>
            Take a new photo
          </button>
        </div>
      ) : photo ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="The label photo" className="h-24 w-auto rounded border border-white/10" />
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setPhoto("")}>
            Remove
          </button>
        </div>
      ) : (
        <label className="btn-outline inline-flex cursor-pointer px-3 py-1.5 text-xs">
          {busy ? "Preparing the photo…" : "Take or choose a photo"}
          <input type="file" accept="image/jpeg,image/png,image/*" capture="environment" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
      )}
      {err ? <p className="text-xs text-red-300">{err}</p> : null}
      {!photo && !(keep && keepFrom) ? (
        <label className="flex items-center gap-2 text-xs text-white/75">
          <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />
          There is no photo
        </label>
      ) : null}
      {!photo && !(keep && keepFrom) && none ? (
        <input type="text" name="label_skip_reason" maxLength={300} placeholder="Why, e.g. the label is unreadable" aria-label="Why there is no photo" />
      ) : (
        <input type="hidden" name="label_skip_reason" value="" />
      )}
    </fieldset>
  );
}
