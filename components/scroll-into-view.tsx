"use client";

import { useEffect } from "react";

/** Brings one element into view once it is on screen, e.g. the leaver questions when Make them a
 *  leaver opens Manage record (the absence recheck, 2026-10-08: they sat below a scroll). */
export default function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [targetId]);
  return null;
}
