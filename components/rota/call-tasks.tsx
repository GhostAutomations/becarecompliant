"use client";

/**
 * Be Care Compliant: tasks at each call, on the service user's Care plan page (Rota and Visits
 * Stage 4, Phil's popups 2026-10-16). One card per call in the current Care Schedule. Pick tasks
 * from the starter list or the company's own tasks, or type one; mark the key ones (the carer must
 * give them an outcome before clock out); Save keeps the old version. A call's tasks can be copied
 * to other calls. Only shown when the company has Rota and Visits on.
 */

import { useEffect, useMemo, useState } from "react";
import ActionForm from "@/components/rota/rota-action";
import { addLibraryTaskAction, archiveLibraryTaskAction, copyCallTasksAction, saveCallTasksAction } from "@/lib/rota/task-actions";
import { MAX_TASKS, STARTER_TASKS, cleanTaskList, type TaskItem } from "@/lib/rota/tasks";
import { DAY_NAMES, slotLabel } from "@/lib/rota/calls";
import type { CallTasks } from "@/lib/rota/tasks-data";

type Library = { id: string; name: string; category: string }[];

// A list's content without the ids the server adds, to tell whether it has changed.
const sig = (list: TaskItem[]) => JSON.stringify(list.map((t) => [t.name, t.category, t.key]));
const callKey = (c: CallTasks) => `${c.dayOfWeek}|${c.service}|${c.slotKey}|${c.occurrence}`;
const callName = (c: CallTasks) =>
  [DAY_NAMES[c.dayOfWeek], c.service, c.slotKey ? slotLabel(c.slotKey) : null, c.occurrence > 1 ? `(${c.occurrence})` : null, c.startTime ? `at ${c.startTime}` : null]
    .filter(Boolean)
    .join(" · ");

export default function CallTasks({
  serviceUserId,
  calls,
  library,
  canEdit,
}: {
  serviceUserId: string;
  calls: CallTasks[];
  library: Library;
  canEdit: boolean;
}) {
  return (
    <section className="glass-card space-y-4 p-5" aria-label="Tasks at each call">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-white">Tasks at each call</h2>
        <p className="text-sm text-white/60">
          What the carer does at each call. They mark each task done, refused or not needed at the visit. Mark the key tasks: the carer must give those an outcome before they clock out.
        </p>
      </div>
      {calls.length === 0 ? <p className="text-sm text-white/55">No calls in the Care Schedule yet. Add calls above, then set their tasks here.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {calls.map((c) => (
          <CallCard key={callKey(c)} serviceUserId={serviceUserId} call={c} calls={calls} library={library} canEdit={canEdit} />
        ))}
      </div>
      {canEdit ? <LibraryEditor library={library} /> : null}
    </section>
  );
}

function CallCard({
  serviceUserId,
  call,
  calls,
  library,
  canEdit,
}: {
  serviceUserId: string;
  call: CallTasks;
  calls: CallTasks[];
  library: Library;
  canEdit: boolean;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>(call.tasks);
  const saved = sig(call.tasks);
  // After a save the page refreshes with the saved list (and its ids): take that as the new start.
  useEffect(() => {
    setTasks(call.tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const [pick, setPick] = useState("");
  const [typed, setTyped] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const changed = sig(tasks) !== saved;
  const others = calls.filter((c) => callKey(c) !== callKey(call));

  const options = useMemo(() => {
    const have = new Set(tasks.map((t) => t.name.toLowerCase()));
    return {
      starter: STARTER_TASKS.map((g) => ({ category: g.category, tasks: g.tasks.filter((t) => !have.has(t.toLowerCase())) })).filter((g) => g.tasks.length),
      custom: library.filter((l) => !have.has(l.name.toLowerCase())),
    };
  }, [tasks, library]);

  function add(name: string, category: string) {
    setTasks((prev) => cleanTaskList([...prev, { name, category, key: false }]));
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/90">{callName(call)}</h3>
        <span className="text-xs text-white/45">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
          {tasks.some((t) => t.key) ? ` · ${tasks.filter((t) => t.key).length} key` : ""}
        </span>
      </div>

      {tasks.length === 0 ? <p className="text-xs text-white/45">No tasks yet.</p> : null}
      <ul className="space-y-1.5">
        {tasks.map((t, i) => (
          <li key={`${t.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="min-w-0 flex-1 text-sm text-white/85">
              {t.name}
              <span className="ml-2 text-xs text-white/40">{t.category}</span>
            </span>
            {canEdit ? (
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={t.key}
                    onChange={(e) => setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.checked } : x)))}
                    aria-label={`Key task: ${t.name}`}
                  />
                  Key
                </label>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${t.name}`}>
                  Remove
                </button>
              </span>
            ) : t.key ? (
              <span className="pill pill-amber">Key</span>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Pick a task</span>
              <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={tasks.length >= MAX_TASKS}>
                <option value="">Pick a task…</option>
                {options.custom.length ? (
                  <optgroup label="Your company's tasks">
                    {options.custom.map((l) => (
                      <option key={l.id} value={`${l.category}::${l.name}`}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {options.starter.map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.tasks.map((t) => (
                      <option key={t} value={`${g.category}::${t}`}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={!pick}
              onClick={() => {
                const [category, name] = pick.split("::");
                add(name, category);
                setPick("");
              }}
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Type a task</span>
              <input type="text" value={typed} maxLength={120} placeholder="Or type a task for this call" onChange={(e) => setTyped(e.target.value)} disabled={tasks.length >= MAX_TASKS} />
            </label>
            <button
              type="button"
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={!typed.trim()}
              onClick={() => {
                add(typed, "Custom");
                setTyped("");
              }}
            >
              Add
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <ActionForm
              action={saveCallTasksAction}
              hidden={{
                service_user_id: serviceUserId,
                day_of_week: String(call.dayOfWeek),
                service: call.service,
                slot_key: call.slotKey,
                occurrence: String(call.occurrence),
                tasks: JSON.stringify(tasks),
              }}
              label={changed ? "Save tasks" : "Saved"}
              savingLabel="Saving…"
              savedLabel="Saved"
              buttonClassName={changed ? "btn-primary px-3 py-1.5 text-xs" : "btn-saved px-3 py-1.5 text-xs"}
              className=""
              disabled={!changed}
            />
            {others.length && tasks.length ? (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setCopyOpen((v) => !v)}>
                {copyOpen ? "Hide copy" : "Copy to other calls"}
              </button>
            ) : null}
            {changed ? <span className="text-xs text-amber-300">Not saved yet</span> : null}
          </div>

          {copyOpen && others.length ? (
            <ActionForm
              action={copyCallTasksAction}
              hidden={{ service_user_id: serviceUserId, tasks: JSON.stringify(tasks) }}
              label="Copy these tasks"
              savingLabel="Copying…"
              savedLabel="Copied"
              buttonClassName="btn-outline px-3 py-1.5 text-xs"
              className="space-y-2 rounded-lg bg-white/5 p-3"
              showOk
              confirm="Copy these tasks to the ticked calls? Their current tasks are replaced (the old lists are kept as earlier versions)."
            >
              <p className="text-xs text-white/60">Copy this call&apos;s tasks to:</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {others.map((o) => (
                  <label key={callKey(o)} className="flex items-center gap-2 text-xs text-white/80">
                    <input type="checkbox" name="target" value={callKey(o)} />
                    {callName(o)}
                  </label>
                ))}
              </div>
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LibraryEditor({ library }: { library: Library }) {
  return (
    <details className="rounded-xl border border-white/10 bg-white/5 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white/85">Your company&apos;s own tasks ({library.length})</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-white/55">Tasks you add here appear in the task picker for every service user in your company, beside the starter list.</p>
        {library.length === 0 ? <p className="text-xs text-white/45">None yet.</p> : null}
        <ul className="space-y-1">
          {library.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm text-white/80">
              <span>
                {l.name}
                <span className="ml-2 text-xs text-white/40">{l.category}</span>
              </span>
              <ActionForm action={archiveLibraryTaskAction} hidden={{ task_id: l.id }} label="Remove" savingLabel="Removing…" savedLabel="Removed" buttonClassName="btn-ghost px-2 py-1 text-xs" className="" />
            </li>
          ))}
        </ul>
        <ActionForm action={addLibraryTaskAction} label="Add task" className="flex flex-wrap items-end gap-2" buttonClassName="btn-outline px-3 py-1.5 text-xs" showOk>
          <label className="min-w-[12rem] flex-1">
            <span className="sr-only">New task</span>
            <input type="text" name="name" maxLength={120} required placeholder="For example: Feed the cat" />
          </label>
          <label className="w-48">
            <span className="sr-only">Group</span>
            <select name="category" defaultValue="Custom">
              <option value="Custom">Custom</option>
              {STARTER_TASKS.map((g) => (
                <option key={g.category} value={g.category}>
                  {g.category}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      </div>
    </details>
  );
}
