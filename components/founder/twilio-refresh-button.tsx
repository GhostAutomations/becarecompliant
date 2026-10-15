"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshTwilioBalance } from "@/lib/founder/twilio-actions";

/** Refresh on the Twilio tile: reads the balance again now (it is otherwise kept 15 minutes). */
export function TwilioRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshTwilioBalance();
          router.refresh();
        })
      }
    >
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
