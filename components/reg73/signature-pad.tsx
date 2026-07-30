"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drawn signature capture. High internal resolution (960x280) so strokes stay crisp
 * on retina screens and in the exported PDF, with quadratic-curve smoothing between
 * points so the line is smooth, not jagged. White background so the stored PNG reads
 * cleanly. Writes a PNG data URL into a hidden input the form submits.
 */
const W = 960;
const H = 280;

export default function SignaturePad({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState(defaultValue ?? "");

  function ctx() {
    return canvasRef.current!.getContext("2d")!;
  }
  function reset() {
    const c = ctx();
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, W, H);
    c.lineWidth = 4.5;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#0f172a";
  }

  useEffect(() => {
    reset();
    if (defaultValue && defaultValue.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => ctx().drawImage(img, 0, 0, W, H);
      img.src = defaultValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  function point(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
  }
  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    last.current = point(e);
    const c = ctx();
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = point(e);
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    const c = ctx();
    c.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    c.stroke();
    c.beginPath();
    c.moveTo(mid.x, mid.y);
    last.current = p;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setValue(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    reset();
    setValue("");
  }
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        reset();
        // Fit the uploaded image within the pad, keeping its aspect ratio.
        const scale = Math.min(W / img.width, H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx().drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        setValue(canvasRef.current!.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ aspectRatio: `${W} / ${H}` }}
        className="w-full max-w-md touch-none rounded-lg border border-white/20 bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-1 flex items-center gap-3 text-xs">
        <button type="button" onClick={clear} className="text-white/50 hover:text-white/80">
          Clear
        </button>
        <label className="cursor-pointer text-gold-300 hover:text-gold-400">
          Upload a saved signature
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </label>
      </div>
    </div>
  );
}
