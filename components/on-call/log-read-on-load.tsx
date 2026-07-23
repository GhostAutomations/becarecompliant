"use client";

import { useEffect } from "react";
import { recordLogRead } from "@/lib/on-call/actions";

/** Records that the current user has opened this shift's log (once, on mount). */
export default function LogReadOnLoad({ logId }: { logId: string }) {
  useEffect(() => {
    void recordLogRead(logId);
  }, [logId]);
  return null;
}
