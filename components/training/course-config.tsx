"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { saveCourse } from "@/lib/training/actions";
import type { TrainingCourse } from "@/lib/training/data";

function CourseRow({ course }: { course: TrainingCourse | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveCourse, IDLE_STATE);
  const isNew = course == null;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-white/5 py-3">
      {course ? <input type="hidden" name="course_id" value={course.id} /> : null}
      <div className="min-w-[12rem] flex-1">
        {isNew ? <label className="form-label">New course</label> : null}
        <input
          name="name"
          type="text"
          defaultValue={course?.name ?? ""}
          placeholder="Course name"
          className="w-full"
          required
        />
      </div>
      <div>
        <label className="form-label">Renews (months)</label>
        <input
          name="renewal_months"
          type="number"
          min={1}
          defaultValue={course?.renewal_months ?? ""}
          placeholder="One off"
          className="max-w-[7rem]"
        />
      </div>
      <div>
        <label className="form-label">Amber (days)</label>
        <input
          name="amber_days"
          type="number"
          min={0}
          defaultValue={course?.amber_days ?? 30}
          className="max-w-[6rem]"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs text-white/80">
        <input type="checkbox" name="mandatory" defaultChecked={course?.mandatory ?? true} />
        Mandatory
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs text-white/80">
        <input type="checkbox" name="is_safeguarding" defaultChecked={course?.is_safeguarding ?? false} />
        Safeguarding
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs text-white/80">
        <input type="checkbox" name="active" defaultChecked={course?.active ?? true} />
        Active
      </label>
      <button type="submit" disabled={pending} className="btn-outline px-3 py-2 text-xs">
        {pending ? "Saving…" : isNew ? "Add" : "Save"}
      </button>
      {state.error ? <span className="w-full text-xs text-red-300">{state.error}</span> : null}
    </form>
  );
}

export default function CourseConfig({ courses }: { courses: TrainingCourse[] }) {
  const [addKey, setAddKey] = useState(0);

  return (
    <div className="space-y-1">
      <p className="page-subtitle">
        The training courses in your matrix. Set how often each renews (blank means a one off course
        with no renewal), whether it counts towards mandatory training, and which one is the
        safeguarding course used by the PQS.
      </p>
      {courses.map((c) => (
        <CourseRow key={c.id} course={c} />
      ))}
      <div className="pt-2">
        <CourseRow key={`new-${addKey}`} course={null} />
        <button
          type="button"
          onClick={() => setAddKey((k) => k + 1)}
          className="mt-1 text-xs text-white/50 hover:text-white/80"
        >
          Clear the add row
        </button>
      </div>
    </div>
  );
}
