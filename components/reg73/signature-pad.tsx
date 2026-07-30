"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drawn signature capture. Writes a PNG data URL into a hidden input the form
 * submits. White background so the stored image reads cleanly in the PDF.
 */
export default function SignaturePad({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    if (defaultValue && defaultValue.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = defaultValue;
    }
  }, [defaultValue]);

  function point(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setValue("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <canvas
        ref={canvasRef}
        width={480}
        height={140}
        className="w-full max-w-md touch-none rounded-lg border border-white/20 bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" onClick={clear} className="mt-1 block text-xs text-white/50 hover:text-white/80">
        Clear signature
      </button>
    </div>
  );
}
