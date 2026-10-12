"use client";

/**
 * Be Care Compliant: how a letter is signed (Phil, 2026-10-12, Job 2 Part A,
 * docs/decisions/letter-signatures.md).
 *
 * Four choices: my saved uploaded signature, my saved drawn signature, sign now (drawn for this
 * letter only, never saved), or no signature. Whoever signs gets their own name and job title under
 * it. Only the signed in person's own signatures are ever offered; for anyone who cannot sign (other
 * roles, the Founder in support mode) nothing is shown and the letter goes unsigned as before.
 *
 * Posts signature_choice, and signature_now when drawing now, inside whatever form it sits in.
 * onChange is told every change, so a live preview can redraw.
 */

import { useEffect, useState } from "react";
import SignaturePad from "@/components/reg73/signature-pad";
import { myLetterSignatures, type MySignatures } from "@/lib/letters/signature-actions";
import type { SignatureChoice as Choice } from "@/lib/letters/signature-rules";

export type SignatureValue = { choice: Choice; now: string };

export default function SignatureChoice({
  onChange,
  disabled,
  className,
}: {
  onChange?: (value: SignatureValue) => void;
  disabled?: boolean;
  /** For the box around it: nothing at all is drawn for somebody who cannot sign. */
  className?: string;
}) {
  const [mine, setMine] = useState<MySignatures | null>(null);
  const [choice, setChoice] = useState<Choice>("none");
  const [now, setNow] = useState("");

  useEffect(() => {
    let live = true;
    myLetterSignatures()
      .then((m) => {
        if (!live) return;
        setMine(m);
        // A saved signature is the natural choice; nothing saved means no signature until chosen.
        const first: Choice = m.upload ? "upload" : m.drawn ? "drawn" : "none";
        setChoice(first);
        onChange?.({ choice: first, now: "" });
      })
      .catch(() => live && setMine({ eligible: false, upload: null, drawn: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mine || !mine.eligible) return null;

  function pick(c: Choice) {
    setChoice(c);
    onChange?.({ choice: c, now: c === "now" ? now : "" });
  }

  const option = (c: Choice, label: string, img: string | null, missing?: string) => (
    <label
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
        choice === c ? "border-gold-400/50 bg-gold-400/10 text-white" : "border-white/10 text-white/80"
      } ${missing ? "opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="signature_choice_pick"
        checked={choice === c}
        disabled={disabled || Boolean(missing)}
        onChange={() => pick(c)}
      />
      <span className="min-w-0 flex-1">
        {label}
        {missing ? <span className="block text-xs text-white/50">{missing}</span> : null}
      </span>
      {img ? (
        // Your own signature only, through a link that lasts two minutes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="h-8 max-w-[7rem] rounded bg-white object-contain p-0.5" />
      ) : null}
    </label>
  );

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <input type="hidden" name="signature_choice" value={choice} />
      <span className="form-label mb-0">Signature</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {option("upload", "My uploaded signature", mine.upload?.url ?? null, mine.upload ? undefined : "None saved yet")}
        {option("drawn", "My drawn signature", mine.drawn?.url ?? null, mine.drawn ? undefined : "None saved yet")}
        {option("now", "Sign now", null)}
        {option("none", "No signature", null)}
      </div>
      {choice === "now" ? (
        <div>
          <p className="mb-1 text-xs text-white/60">Draw your signature. It is used on this letter only and not saved.</p>
          <SignaturePad
            name="signature_now"
            onChange={(url) => {
              setNow(url);
              onChange?.({ choice: "now", now: url });
            }}
          />
        </div>
      ) : null}
      <p className="text-xs text-white/50">
        Your name and job title go under your signature.{" "}
        <a href="/my-signature" target="_blank" rel="noreferrer" className="underline">
          Add or change your signatures
        </a>
        .
      </p>
    </div>
  );
}
