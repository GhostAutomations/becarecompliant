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
 * EVERY EDIT CARRIES A DATE (Phil, 2026-09-09: "i think the new plan starts on should be
 * required for any edits"). There is no correct-in-place button any more, because a care
 * package always changes ON a day and the invoices either side of that day are not the same
 * money. Choosing the date the current schedule already started means you are correcting that
 * version rather than starting another — the server reads it that way, so a typo spotted an
 * hour later is still fixable without inventing a version that lived for no time at all.
 */

import CarePlanEditor from "./care-plan-editor";
import { updateCarePlan } from "@/lib/service-users/actions";
import type { CarePlanEntry } from "@/lib/service-users/care-plan-consts";
import { useRouter } from "next/navigation";

export default function CareScheduleEditor({
  serviceUserId,
  initial,
  servicesWithFixed,
  today,
  hasPlan,
  currentFrom,
  backHref,
}: {
  serviceUserId: string;
  initial: CarePlanEntry[];
  servicesWithFixed: string[];
  today: string;
  hasPlan: boolean;
  /** The date the schedule on screen started, so the note can say what a correction means. */
  currentFrom: string | null;
  backHref: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {hasPlan && currentFrom ? (
        <p className="text-xs text-white/55">
          Every change starts on a date, because the invoices either side of it are not the same
          money. Leave the date as it is to CORRECT the schedule that began then; choose a later
          date to start a new one and keep the current schedule for invoices already raised.
        </p>
      ) : null}

      <CarePlanEditor
        mode="update"
        action={updateCarePlan}
        serviceUserId={serviceUserId}
        initial={initial}
        servicesWithFixed={servicesWithFixed}
        today={hasPlan && currentFrom ? currentFrom : today}
        /* Back to the record on save, so the tile you came from shows the week you have just
           written. router.push rather than a location change: the record is a server component
           and this keeps the client navigation the rest of the app uses. */
        onSaved={() => router.push(backHref)}
      />
    </div>
  );
}
