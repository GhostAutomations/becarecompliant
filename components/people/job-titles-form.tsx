"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addJobTitle, removeJobTitle } from "@/lib/people/actions";
import type { JobTitle } from "@/lib/people/data";

/** Manage the company's staff job titles (used by the Add a Person dropdown). */
export default function JobTitlesForm({ titles }: { titles: JobTitle[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  function add() {
    const title = newTitle.trim();
    if (!title) return;
    const fd = new FormData();
    fd.set("title", title);
    startTransition(async () => {
      const res = await addJobTitle(fd);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setNewTitle("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await removeJobTitle(fd);
      if (res.error) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="page-subtitle">
        These titles appear in the Job Title dropdown when adding a person. Add the
        roles your company uses.
      </p>

      {titles.length === 0 ? (
        <p className="text-sm text-white/50">No job titles yet. Add your first below.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {titles.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-sm text-white/85"
            >
              {t.title}
              <button
                type="button"
                onClick={() => remove(t.id)}
                disabled={pending}
                aria-label={`Remove ${t.title}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="new_job_title" className="form-label">Add a job title</label>
          <input
            id="new_job_title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Care Assistant"
            className="max-w-xs"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={pending || !newTitle.trim()}
          className="btn-outline text-xs disabled:opacity-40"
        >
          {pending ? "Saving…" : "Add"}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
