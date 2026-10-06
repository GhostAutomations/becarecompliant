"use client";

/**
 * Be Care Compliant: the two document colours (0410). Printed on every policy's cover, laid out
 * like Thistle's own: the main colour is the band behind the policy title, the second colour is
 * the company name above it. Until they are set, Be Care Compliant's navy and gold are used.
 */

import { useState } from "react";
import ActionForm from "@/components/action-form";
import { saveDocumentColours } from "@/app/(app)/settings/actions";

export default function DocumentColours({
  primary,
  secondary,
  isDefault,
  companyName,
}: {
  primary: string;
  secondary: string;
  isDefault: boolean;
  companyName: string;
}) {
  const [p, setP] = useState(primary);
  const [s, setS] = useState(secondary);
  return (
    <div className="space-y-4">
      <ActionForm action={saveDocumentColours} label="Save colours">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="brand_primary" className="form-label">Main colour</label>
            <div className="flex items-center gap-3">
              <input id="brand_primary" name="brand_primary" type="color" value={p} onChange={(e) => setP(e.target.value)} />
              <span className="text-xs text-white/60">{p}</span>
            </div>
            <p className="form-hint">The band behind the policy title.</p>
          </div>
          <div>
            <label htmlFor="brand_secondary" className="form-label">Second colour</label>
            <div className="flex items-center gap-3">
              <input id="brand_secondary" name="brand_secondary" type="color" value={s} onChange={(e) => setS(e.target.value)} />
              <span className="text-xs text-white/60">{s}</span>
            </div>
            <p className="form-hint">Your company name above it.</p>
          </div>
        </div>
        {/* A small preview of the cover's lower half, so the choice is seen before it is saved. */}
        <div className="overflow-hidden rounded-xl border border-white/15 bg-white">
          <p className="px-4 pb-3 pt-5 text-center text-2xl font-bold" style={{ color: s }}>{companyName}</p>
          <p className="px-4 py-6 text-center text-sm font-semibold text-white" style={{ backgroundColor: p }}>Your policy title</p>
        </div>
      </ActionForm>
      {!isDefault ? (
        <ActionForm action={saveDocumentColours} hidden={{ reset: "1" }} label="Use Be Care Compliant colours" buttonClassName="btn-outline text-xs" />
      ) : null}
    </div>
  );
}
