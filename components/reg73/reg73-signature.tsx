"use client";

import { useState } from "react";
import SignaturePad from "@/components/reg73/signature-pad";

/**
 * Sign off choice: draw now, upload a saved signature, or sign the printed version.
 * Only the chosen control shows. Outputs sign_method and (for draw/upload) ri_signature.
 */
const OPTIONS = [
  { v: "draw", label: "Sign now" },
  { v: "upload", label: "Upload a saved signature" },
  { v: "printed", label: "Sign the printed version" },
];

export default function Reg73Signature({
  defaultMethod,
  defaultSignature,
}: {
  defaultMethod: string;
  defaultSignature: string;
}) {
  const hasSig = defaultSignature.startsWith("data:image");
  const [method, setMethod] = useState(defaultMethod || (hasSig ? "draw" : "printed"));
  const [uploaded, setUploaded] = useState(hasSig ? defaultSignature : "");

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploaded(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="sign_method" value={method} />
      <div className="flex flex-wrap gap-4">
        {OPTIONS.map((o) => (
          <label key={o.v} className="flex items-center gap-2 text-sm text-white/80">
            <input type="radio" checked={method === o.v} onChange={() => setMethod(o.v)} />
            {o.label}
          </label>
        ))}
      </div>

      {method === "draw" ? (
        <SignaturePad name="ri_signature" defaultValue={hasSig ? defaultSignature : undefined} />
      ) : method === "upload" ? (
        <div>
          <input type="hidden" name="ri_signature" value={uploaded} />
          <label className="btn-outline inline-block cursor-pointer px-3 py-2 text-xs">
            Choose an image
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>
          {uploaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploaded} alt="Signature" className="mt-2 h-20 rounded bg-white p-1" />
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-white/55">
          The report will be printed and signed by hand. No digital signature is captured.
        </p>
      )}
    </div>
  );
}
