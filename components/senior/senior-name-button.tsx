"use client";

/**
 * A name on a Senior's list, as a gold button (Phil, 2026-09-29: "each name should be its own
 * gold button ... click that name and then it opens up the form or forms that they are going to
 * do"). One form: the button IS the link to it. More than one: the button opens a small dialog
 * with a gold button per form, and its status under it, so the Senior picks which.
 */

import Link from "next/link";
import { useState } from "react";
import { CentreDialog } from "@/components/panel-dialog";

export type SeniorFormLink = { href: string; name: string; status: string };

export default function SeniorNameButton({ name, forms }: { name: string; forms: SeniorFormLink[] }) {
  const [open, setOpen] = useState(false);

  if (forms.length === 1) {
    return (
      <Link href={forms[0].href} className="btn-primary w-full justify-center px-4 py-3 text-sm">
        {name}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary w-full justify-center px-4 py-3 text-sm"
      >
        {name}
      </button>
      <CentreDialog open={open} onClose={() => setOpen(false)} label={name}>
        <div className="mx-auto max-w-md space-y-3 p-5">
          <p className="text-sm text-white/60">Which form are you completing?</p>
          {forms.map((f) => (
            <div key={f.href}>
              <Link href={f.href} className="btn-primary w-full justify-center px-4 py-3 text-sm">
                {f.name}
              </Link>
              {f.status ? <p className="mt-1 text-center text-xs text-white/50">{f.status}</p> : null}
            </div>
          ))}
        </div>
      </CentreDialog>
    </>
  );
}
