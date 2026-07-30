"use client";

import { useRef, useState } from "react";

/**
 * Optional image field (survey chart, call duration table). Downscales the chosen image
 * client side to a sensible width and stores it as a JPEG data URL in a hidden input, so
 * it travels with the form like the drawn signature and the shared PDF engine embeds it.
 * No external upload, no Storage bucket: keeps the review self contained.
 */
const MAX_W = 1200;

export default function Reg80ImageInput({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_W / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setValue(src);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setValue(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => setValue(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  function clear() {
    setValue("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mt-1">
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-3">
        <label className="btn-outline inline-block cursor-pointer px-3 py-2 text-xs">
          {value ? "Replace image" : "Choose image"}
          <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>
        {value ? (
          <button type="button" onClick={clear} className="text-xs text-white/50 hover:text-white/80">
            Remove
          </button>
        ) : null}
      </div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Uploaded" className="mt-2 max-h-48 rounded border border-white/15 bg-white p-1" />
      ) : null}
    </div>
  );
}
