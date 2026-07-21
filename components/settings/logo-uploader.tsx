"use client";

/**
 * Branding logo uploader with a built-in crop tool (no external library).
 * Pick an image, drag the box to move it and the corner handle to resize it,
 * then Save. The selected area is drawn to a canvas at the image's native
 * resolution (so quality is preserved) and submitted through saveCompanyLogo.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCompanyLogo } from "@/app/(app)/settings/actions";

type Box = { x: number; y: number; w: number; h: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function LogoUploader() {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; orig: Box } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8_000_000) {
      setMsg({ error: "Please choose an image under 8MB." });
      return;
    }
    setMsg(null);
    setSrc(URL.createObjectURL(f));
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setDisp({ w, h });
    // Default to the whole image; the user pulls the corner in to crop.
    setBox({ x: 0, y: 0, w, h });
  }

  const startDrag = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...box } };
  };

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    const o = drag.current.orig;
    if (drag.current.mode === "move") {
      setBox({ x: clamp(o.x + dx, 0, disp.w - o.w), y: clamp(o.y + dy, 0, disp.h - o.h), w: o.w, h: o.h });
    } else {
      setBox({ x: o.x, y: o.y, w: clamp(o.w + dx, 24, disp.w - o.x), h: clamp(o.h + dy, 24, disp.h - o.y) });
    }
  }

  function endDrag() {
    drag.current = null;
  }

  function save() {
    const img = imgRef.current;
    if (!img || box.w < 8 || box.h < 8) return;
    const scaleX = img.naturalWidth / disp.w;
    const scaleY = img.naturalHeight / disp.h;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(box.w * scaleX));
    canvas.height = Math.max(1, Math.round(box.h * scaleY));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setMsg({ error: "Could not crop the image. Please try again." });
      return;
    }
    ctx.drawImage(
      img,
      box.x * scaleX, box.y * scaleY, box.w * scaleX, box.h * scaleY,
      0, 0, canvas.width, canvas.height,
    );
    canvas.toBlob((blob) => {
      if (!blob) {
        setMsg({ error: "Could not crop the image. Please try again." });
        return;
      }
      if (blob.size > 2_000_000) {
        setMsg({ error: "The cropped logo is over 2MB. Crop tighter or use a smaller image." });
        return;
      }
      const file = new File([blob], "logo.png", { type: "image/png" });
      const fd = new FormData();
      fd.set("logo", file);
      startTransition(async () => {
        const res = await saveCompanyLogo({}, fd);
        if (res.error) {
          setMsg({ error: res.error });
        } else {
          setMsg({ ok: res.ok ?? "Logo saved" });
          setSrc(null);
          router.refresh();
        }
      });
    }, "image/png");
  }

  if (!src) {
    return (
      <div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFile}
          className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
        />
        {msg?.ok ? <p className="mt-2 text-xs text-emerald-300">{msg.ok}</p> : null}
        {msg?.error ? <p className="mt-2 text-xs text-red-300">{msg.error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="form-hint">Drag the box to move it, and the gold corner to resize. Save when the crop looks right.</p>
      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        className="relative inline-block max-w-full select-none rounded bg-white/90 p-1"
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Logo to crop"
          onLoad={onImgLoad}
          draggable={false}
          className="block max-h-[320px] max-w-full"
        />
        {/* Crop box */}
        <div
          onPointerDown={startDrag("move")}
          className="absolute cursor-move border-2 border-gold-400"
          style={{ left: box.x + 4, top: box.y + 4, width: box.w, height: box.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
        >
          <div
            onPointerDown={startDrag("resize")}
            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-sm bg-gold-400"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-sm">
          {pending ? "Saving…" : "Save logo"}
        </button>
        <button
          type="button"
          onClick={() => { setSrc(null); setMsg(null); }}
          disabled={pending}
          className="btn-outline text-sm"
        >
          Choose a different image
        </button>
        {msg?.error ? <span className="text-xs text-red-300">{msg.error}</span> : null}
      </div>
    </div>
  );
}
