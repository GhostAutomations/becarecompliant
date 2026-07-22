"use client";

import { useEffect, useRef } from "react";
import { captureReadinessSnapshot } from "@/lib/framework/actions";

/** Fires once on mount to record today's readiness scores for the trend. */
export default function SnapshotOnLoad() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    captureReadinessSnapshot().catch(() => {});
  }, []);
  return null;
}
