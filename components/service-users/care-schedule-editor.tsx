"use client";

/**
 * Be Care Compliant — the care schedule editor, and nothing else.
 *
 * Phil, 2026-09-09: "when edit care schedule is clicked it should just go to the schedule
 * editor, i dont want to see anything to do with the care plan."
 *
 * The care plan PAGE carries three other things — the uploaded care plan document, a summary
 * of the week you have just come from, and the version history — and none of them is what
 * somebody pressing Edit care schedule came for. This page is the week, editable, on its own.
 *
 * The new dated version route stays, because the two are not the same thing: a new version
 * leaves past invoices billed on the old plan, and correcting in place does not. It is a
 * toggle here rather than a gate in front of the editor.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import CarePlanEditor from "./care-plan-editor";
import { saveCarePlan, updateCarePlan } from "@/lib/service-users/actions";
import type { CarePlanEntry } from "@/lib/service-users/care-plan-consts";

export default function CareScheduleEditor({
  serviceUserId,
  initial,
  servicesWithFixed,
  today,
  hasPlan,
  backHref,
}: {
  serviceUserId: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
  today: string;
  hasPlan: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [newVersion, setNewVersion] = useState(false);

  return (
    <div className="space-y-4">
      {hasPlan ? (
        <p className="text-xs text-white/55">
          {newVersion ? (
            <>
              This keeps the current schedule for past invoices and starts a new one from the
              date below.{" "}
              <button
                type="button"
                onClick={() => setNewVersion(false)}
                className="underline decoration-white/25 underline-offset-2 hover:text-white/80"
              >
                Correct the current schedule instead
              </button>
              .
            </>
          ) : (
            <>
              Changes here correct the current schedule in place, so past invoices are
              recalculated on it.{" "}
              <button
                type="button"
                onClick={() => setNewVersion(true)}
                className="underline decoration-white/25 underline-offset-2 hover:text-white/80"
              >
                Start a new dated version instead
              </button>
              , to keep the current one for invoices already raised.
            </>
          )}
        </p>
      ) : null}

      <CarePlanEditor
        key={newVersion ? "new" : "edit"}
        mode={newVersion ? "update" : "edit"}
        action={newVersion ? updateCarePlan : saveCarePlan}
        serviceUserId={serviceUserId}
        initial={initial}
        servicesWithFixed={servicesWithFixed}
        today={today}
        /* Back to the record on save, so the tile you came from shows the week you have just
           written. router.push rather than a location change: the record is a server component
           and this keeps the client navigation the rest of the app uses. */
        onSaved={() => router.push(backHref)}
      />
    </div>
  );
}
