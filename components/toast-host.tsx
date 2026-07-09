"use client";

/**
 * Be Care Compliant — minimal global toast host. Mounted once in the app layout so
 * it outlives any row/component that triggers a toast (e.g. a register row that is
 * about to disappear when its status changes). Trigger from anywhere with:
 *   window.dispatchEvent(new CustomEvent("bcc:toast", { detail: { message } }))
 * No provider/context plumbing needed.
 */

import { useEffect, useState } from "react";

type Toast = { id: number; message: string };

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      if (!message) return;
      const id = ++seq;
      setToasts((t) => [...t, { id, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
    }
    window.addEventListener("bcc:toast", onToast);
    return () => window.removeEventListener("bcc:toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="toast-pill" role="status">
          {t.message}
        </div>
      ))}
    </div>
  );
}
