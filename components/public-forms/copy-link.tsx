"use client";

/**
 * Copy the published link to the clipboard. Follows the save-button feel: the
 * button confirms for about 2 seconds then reverts, never a stuck green state.
 */

import { useEffect, useState } from "react";

export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className={copied ? "btn-saved text-xs" : "btn-outline px-3 py-2 text-xs"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
