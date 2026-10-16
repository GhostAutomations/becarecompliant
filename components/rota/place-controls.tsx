"use client";

/**
 * Be Care Compliant: the office's buttons for one clock in place (Rota and Visits Stage 3, Phil
 * 2026-10-16): "Set from where I am standing" (the office user's phone position, at the home or
 * the branch, accurate to 50 m or better), and on Android Chrome "Write NFC sticker" (Web NFC is
 * not available in iPhone Safari, caniuse.com/webnfc). The sticker holds the same link as the QR
 * code, so tapping it opens Clock in on any phone that reads NFC links.
 */

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CentreDialog } from "@/components/panel-dialog";
import { setPlaceHereAction } from "@/lib/rota/clock-actions";

// Loaded only when the map is opened, so the Clock in page stays light.
const PlaceMap = dynamic(() => import("@/components/rota/place-map"), { ssr: false });

type NdefWriter = { write: (msg: { records: { recordType: string; data: string }[] }) => Promise<void> };

export default function PlaceControls({
  placeId,
  token,
  name,
  point,
  radius,
}: {
  placeId: string;
  token: string;
  name: string;
  point: { lat: number; lng: number } | null;
  radius: number;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<"here" | "nfc" | null>(null);
  const [, startTransition] = useTransition();
  const nfc = typeof window !== "undefined" && "NDEFReader" in window;

  function here() {
    setMsg(null);
    if (!navigator.geolocation) {
      setMsg({ error: "This phone or browser cannot give a position." });
      return;
    }
    setBusy("here");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const fd = new FormData();
        fd.set("place_id", placeId);
        fd.set("lat", String(p.coords.latitude));
        fd.set("lng", String(p.coords.longitude));
        fd.set("accuracy", String(p.coords.accuracy));
        const res = await setPlaceHereAction({}, fd);
        setBusy(null);
        setMsg(res.error ? { error: res.error } : { ok: res.ok });
        if (!res.error) startTransition(() => router.refresh());
      },
      () => {
        setBusy(null);
        setMsg({ error: "No position. Allow location for this site in your phone's settings, then try again." });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function writeSticker() {
    setMsg(null);
    setBusy("nfc");
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
      await new Reader().write({ records: [{ recordType: "url", data: `${location.origin}/c/${token}?via=nfc` }] });
      setMsg({ ok: "Sticker written. Tap it with a phone to check it opens Clock in." });
    } catch (e) {
      setMsg({ error: e instanceof Error && e.name === "NotAllowedError" ? "NFC was not allowed. Allow it for this site and try again." : "The sticker could not be written. Hold the phone on the sticker until it finishes." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => setMapOpen(true)} disabled={busy !== null}>
          Move the pin on the map
        </button>
        <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={here} disabled={busy !== null}>
          {busy === "here" ? "Finding your position…" : "Set from where I am standing"}
        </button>
        {nfc ? (
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={writeSticker} disabled={busy !== null}>
            {busy === "nfc" ? "Hold the phone on the sticker…" : "Write NFC sticker"}
          </button>
        ) : null}
      </div>
      {msg?.ok ? <p className="text-xs text-emerald-300" role="status">{msg.ok}</p> : null}
      {msg?.error ? <p className="form-error">{msg.error}</p> : null}
      <CentreDialog open={mapOpen} onClose={() => setMapOpen(false)} label={`Clock in point: ${name}`}>
        <div className="p-5">
          {mapOpen ? (
            <PlaceMap
              placeId={placeId}
              start={point}
              radius={radius}
              onSaved={() => {
                setMapOpen(false);
                setMsg({ ok: "Pin saved." });
              }}
            />
          ) : null}
        </div>
      </CentreDialog>
    </div>
  );
}
