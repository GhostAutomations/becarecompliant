"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { saveTraining } from "@/lib/training/actions";
import type { TrainingCourse, TrainingCell } from "@/lib/training/data";

export default function TrainingCellDialog({
  personId,
  personName,
  course,
  cell,
  onClose,
}: {
  personId: string;
  personName: string;
  course: TrainingCourse;
  cell: TrainingCell;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveTraining, IDLE_STATE);
  const isOneOff = course.renewal_months == null;
  const hasRecord = !!cell.recordId;

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{course.name}</h2>
        <p className="mt-1 text-sm text-white/55">
          {personName}
          {isOneOff ? " · one off course" : ` · renews every ${course.renewal_months} months`}
        </p>

        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="person_id" value={personId} />
          <input type="hidden" name="course_id" value={course.id} />

          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="completed_on" className="form-label">
                Completed
              </label>
              <input
                id="completed_on"
                name="completed_on"
                type="date"
                defaultValue={cell.completedOn ?? ""}
                className="max-w-[10rem]"
              />
            </div>
            {!isOneOff && (
              <div>
                <label htmlFor="expiry_on" className="form-label">
                  Renewal due
                </label>
                <input
                  id="expiry_on"
                  name="expiry_on"
                  type="date"
                  defaultValue={cell.expiryOn ?? ""}
                  className="max-w-[10rem]"
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="certificate" className="form-label">
              Certificate (optional)
            </label>
            <input id="certificate" name="certificate" type="file" className="text-sm text-white/70" />
            {cell.hasCertificate && cell.recordId ? (
              <a
                href={`/api/training/${cell.recordId}/certificate`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-gold-300 underline"
              >
                View current certificate
              </a>
            ) : null}
          </div>

          {state.error ? <p className="form-error">{state.error}</p> : null}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" name="intent" value="save" disabled={pending} className="btn-primary px-4 py-2 text-sm">
              {pending ? "Saving…" : "Save"}
            </button>
            {hasRecord ? (
              <button
                type="submit"
                name="intent"
                value="clear"
                disabled={pending}
                className="btn-outline border-rag-red/40 px-3 py-2 text-xs text-rag-red-soft hover:bg-rag-red/10"
              >
                Clear
              </button>
            ) : null}
            <button type="button" onClick={onClose} disabled={pending} className="btn-ghost ml-auto px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
