"use client";

import { useRef, useState } from "react";

/**
 * Optional image field (survey chart, call duration table). Downscales the chosen image
 * client side, bounding BOTH dimensions, and stores it as a JPEG data URL in a hidden
 * input, so it travels with the form like the drawn signature and the shared PDF engine
 * embeds it. No external upload, no Storage bucket: keeps the review self contained.
 *
 * It reports its processing state via onBusyChange so the form can block save and submit
 * until every image has finished: otherwise a submit fired mid decode would drop an image
 * whose hidden input was still empty.
 */
const MAX_DIM = 1200;

export default function Reg80ImageInput({
  name,
  defaultValue,
  onBusyChange,
}: {
  name: string;
  defaultValue?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function begin() {
    setErr(null);
    setBusy(true);
    onBusyChange?.(true);
  }
  function finish() {
    setBusy(false);
    onBusyChange?.(false);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    begin();
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setErr("Could not process that image. Try a different file.");
          finish();
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setValue(canvas.toDataURL("image/jpeg", 0.78));
        finish();
      };
      img.onerror = () => {
        setErr("Could not process that image. Try a different file.");
        finish();
      };
      img.src = src;
    };
    reader.onerror = () => {
      setErr("Could not read that file. Try again.");
      finish();
    };
    reader.readAsDataURL(file);
  }

  function clear() {
    setValue("");
    setErr(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mt-1">
      <input type="hidden" name={name} value={value} />
      {/* The file input is a standalone element the button clicks by ref, rather than a
          label wrapped input: one unambiguous trigger per field, no label association to
          collide with a neighbouring field. */}
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-outline px-3 py-2 text-xs"
        >
          {value ? "Replace image" : "Choose image"}
        </button>
        {busy ? <span className="text-xs text-white/60">Processing…</span> : null}
        {value && !busy ? (
          <button type="button" onClick={clear} className="text-xs text-white/50 hover:text-white/80">
            Remove
          </button>
        ) : null}
      </div>
      {err ? <p className="form-error mt-1">{err}</p> : null}
      {value && !busy ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Uploaded" className="mt-2 max-h-48 rounded border border-white/15 bg-white p-1" />
      ) : null}
    </div>
  );
}
