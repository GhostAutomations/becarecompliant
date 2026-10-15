"use client";

/**
 * Be Care Compliant: the rota's save button (Rota and Visits Stage 1, 2026-10-15).
 *
 * The shared ActionForm, with one difference: the rota's actions do not redraw the page inside
 * their reply. On Bevan, about one save in ten came back 503 while redrawing the page in the same
 * reply, after the save itself had already gone through, and the button stayed on "Saving…" for
 * good. Now each action replies with its result only, and this refreshes the page afterwards with
 * an ordinary page load. Same Saving, Saved and error behaviour as everywhere else.
 */

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import ActionForm from "@/components/action-form";

export default function RotaActionForm(props: ComponentProps<typeof ActionForm>) {
  const router = useRouter();
  const { onDone, onDoneDelayMs, ...rest } = props;
  return (
    <ActionForm
      {...rest}
      onDoneDelayMs={onDoneDelayMs ?? 400}
      onDone={() => {
        onDone?.();
        router.refresh();
      }}
    />
  );
}
