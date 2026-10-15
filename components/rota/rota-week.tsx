"use client";

/**
 * Be Care Compliant: the office's rota for one branch and one week (Rota and Visits Stage 1,
 * Phil 2026-10-15). Mobile first: the days stack, each with its shifts; wider screens show them
 * side by side. Every change goes through ActionForm (Saving, Saved, errors beside the button),
 * and every refusal is the database's own words.
 */

import { useEffect, useState } from "react";
import ActionForm from "@/components/action-form";
import { CentreDialog } from "@/components/panel-dialog";
import {
  addFromTemplateAction,
  assignAction,
  cancelShiftAction,
  getCandidatesAction,
  handoverAction,
  offerShiftAction,
  saveShiftAction,
  swapAction,
  unassignAction,
} from "@/lib/rota/actions";
import { dayLabel, type RotaAssignment, type RotaCandidate, type RotaShift, type RotaTemplate } from "@/lib/rota/types";

type Picker =
  | { mode: "assign"; shift: RotaShift }
  | { mode: "handover"; shift: RotaShift; assignment: RotaAssignment }
  | { mode: "offer"; shift: RotaShift };

export default function RotaWeek({
  branchId,
  days,
  shifts,
  templates,
}: {
  branchId: string;
  days: string[];
  shifts: RotaShift[];
  templates: RotaTemplate[];
}) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const [editing, setEditing] = useState<RotaShift | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<{ shift: RotaShift; assignment: RotaAssignment } | null>(null);
  const allAssignments = shifts.flatMap((s) => s.assignments.map((a) => ({ shift: s, assignment: a })));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => {
          const today = shifts.filter((s) => s.shiftDate === day);
          return (
            <section key={day} aria-label={dayLabel(day)} className="glass-card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white/90">{dayLabel(day)}</h2>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setAdding(day)}>
                  Add shift
                </button>
              </div>
              {today.length === 0 ? (
                <p className="text-xs text-white/45">No shifts.</p>
              ) : (
                today.map((s) => (
                  <ShiftCard
                    key={s.id}
                    shift={s}
                    onAdd={() => setPicker({ mode: "assign", shift: s })}
                    onOffer={() => setPicker({ mode: "offer", shift: s })}
                    onEdit={() => setEditing(s)}
                    onHandover={(a) => setPicker({ mode: "handover", shift: s, assignment: a })}
                    onSwap={(a) => setSwapping({ shift: s, assignment: a })}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>

      <CentreDialog open={adding !== null} onClose={() => setAdding(null)} label={adding ? `Add a shift on ${dayLabel(adding)}` : "Add a shift"}>
        <div className="p-5">{adding ? <AddShift day={adding} branchId={branchId} templates={templates} onDone={() => setAdding(null)} /> : null}</div>
      </CentreDialog>

      <CentreDialog open={editing !== null} onClose={() => setEditing(null)} label="Change shift">
        <div className="p-5">{editing ? <ShiftForm branchId={branchId} shift={editing} day={editing.shiftDate} onDone={() => setEditing(null)} /> : null}</div>
      </CentreDialog>

      <CentreDialog open={picker !== null} onClose={() => setPicker(null)} label={pickerTitle(picker)}>
        <div className="p-5">{picker ? <PersonPicker picker={picker} onDone={() => setPicker(null)} /> : null}</div>
      </CentreDialog>

      <CentreDialog open={swapping !== null} onClose={() => setSwapping(null)} label="Swap with another shift">
        <div className="p-5">
        {swapping ? (
          <SwapForm
            from={swapping}
            options={allAssignments.filter((x) => x.assignment.personId !== swapping.assignment.personId)}
            onDone={() => setSwapping(null)}
          />
        ) : null}
        </div>
      </CentreDialog>
    </>
  );
}

function pickerTitle(p: Picker | null): string {
  if (!p) return "Choose a person";
  const when = `${dayLabel(p.shift.shiftDate)}, ${p.shift.startTime} to ${p.shift.endTime}`;
  if (p.mode === "handover") return `Hand over ${p.assignment.name}'s shift, ${when}`;
  if (p.mode === "offer") return `Text the open shift, ${when}`;
  return `Put someone on ${when}`;
}

function StatusPill({ status }: { status: RotaShift["status"] }) {
  if (status === "published") return <span className="pill pill-green">Published</span>;
  if (status === "cancelled") return <span className="pill pill-red">Cancelled</span>;
  return <span className="pill pill-neutral">Draft</span>;
}

function ShiftCard({
  shift,
  onAdd,
  onOffer,
  onEdit,
  onHandover,
  onSwap,
}: {
  shift: RotaShift;
  onAdd: () => void;
  onOffer: () => void;
  onEdit: () => void;
  onHandover: (a: RotaAssignment) => void;
  onSwap: (a: RotaAssignment) => void;
}) {
  const open = shift.headcount - shift.assignments.length;
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {shift.startTime} to {shift.endTime}
          </p>
          <p className="text-xs text-white/55">
            {[shift.location, shift.breakMinutes ? `${shift.breakMinutes} min break` : null].filter(Boolean).join(" · ") || "No location"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`pill ${open > 0 ? "pill-amber" : "pill-green"}`}>
            {shift.assignments.length} of {shift.headcount}
          </span>
          <StatusPill status={shift.status} />
        </div>
      </div>
      {shift.notes ? <p className="text-xs text-white/60">{shift.notes}</p> : null}

      <ul className="space-y-1.5">
        {shift.assignments.map((a) => (
          <li key={a.id} className="rounded-lg bg-white/5 px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-white/90">{a.name}</span>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onHandover(a)}>
                  Hand over
                </button>
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onSwap(a)}>
                  Swap
                </button>
                <ActionForm
                  action={unassignAction}
                  hidden={{ assignment_id: a.id, shift_id: shift.id }}
                  label="Take off"
                  savingLabel="Taking off…"
                  savedLabel="Taken off"
                  buttonClassName="btn-ghost px-2 py-1 text-xs"
                  className=""
                  confirm={`Take ${a.name} off this shift?${shift.status === "published" ? " They will be sent a text." : ""}`}
                />
              </div>
            </div>
            {a.warnings.length ? (
              <ul className="mt-1 space-y-0.5">
                {a.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-300">
                    {w.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {Array.from({ length: Math.max(0, open) }).map((_, i) => (
          <li key={`open-${i}`} className="rounded-lg border border-dashed border-white/20 px-2.5 py-2 text-xs text-white/50">
            Open
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2 pt-1">
        {open > 0 ? (
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={onAdd}>
            Add person
          </button>
        ) : null}
        {open > 0 && shift.status === "published" ? (
          <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={onOffer}>
            Offer by text
          </button>
        ) : null}
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onEdit}>
          Change
        </button>
        <ActionForm
          action={cancelShiftAction}
          hidden={{ shift_id: shift.id }}
          label="Cancel shift"
          savingLabel="Cancelling…"
          savedLabel="Cancelled"
          buttonClassName="btn-ghost px-3 py-1.5 text-xs"
          className=""
          confirm={`Cancel the shift on ${dayLabel(shift.shiftDate)}, ${shift.startTime} to ${shift.endTime}?${
            shift.status === "published" && shift.assignments.length ? " Everyone on it will be sent a text." : ""
          }`}
        />
      </div>
    </div>
  );
}

function AddShift({ day, branchId, templates, onDone }: { day: string; branchId: string; templates: RotaTemplate[]; onDone: () => void }) {
  return (
    <div className="space-y-6">
      {templates.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white/85">From a template</h3>
          <ActionForm action={addFromTemplateAction} hidden={{ shift_date: day }} label="Add" inline onDone={onDone}>
            <select name="template_id" aria-label="Template" defaultValue={templates[0]?.id}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}: {t.startTime} to {t.endTime}
                  {t.headcount > 1 ? `, ${t.headcount} people` : ""}
                </option>
              ))}
            </select>
          </ActionForm>
        </div>
      ) : (
        <p className="text-xs text-white/50">Tip: save your usual shifts under Templates to add them in one tap.</p>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white/85">Or set the times</h3>
        <ShiftForm branchId={branchId} day={day} onDone={onDone} />
      </div>
    </div>
  );
}

function ShiftForm({ branchId, day, shift, onDone }: { branchId: string; day: string; shift?: RotaShift; onDone: () => void }) {
  return (
    <ActionForm
      action={saveShiftAction}
      hidden={{ branch_id: branchId, shift_id: shift?.id ?? "", template_id: shift?.templateId ?? "" }}
      label={shift ? "Save" : "Add shift"}
      onDone={onDone}
      showOk
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="form-label">Date</span>
          <input type="date" name="shift_date" defaultValue={shift?.shiftDate ?? day} required />
        </label>
        <label className="block">
          <span className="form-label">Start</span>
          <input type="time" name="start_time" defaultValue={shift?.startTime ?? "08:00"} required />
        </label>
        <label className="block">
          <span className="form-label">Finish</span>
          <input type="time" name="end_time" defaultValue={shift?.endTime ?? "14:00"} required />
          <span className="form-hint">Earlier than the start means it ends the next day.</span>
        </label>
        <label className="block">
          <span className="form-label">Break (minutes)</span>
          <input type="number" name="break_minutes" min={0} max={240} defaultValue={shift?.breakMinutes ?? 0} />
        </label>
        <label className="block">
          <span className="form-label">People needed</span>
          <input type="number" name="headcount" min={1} max={20} defaultValue={shift?.headcount ?? 1} />
        </label>
        <label className="col-span-2 block">
          <span className="form-label">Where (optional)</span>
          <input type="text" name="location" maxLength={120} defaultValue={shift?.location ?? ""} placeholder="e.g. Office, or the home's name" />
        </label>
        <label className="col-span-2 block">
          <span className="form-label">Notes (optional)</span>
          <textarea name="notes" maxLength={500} rows={2} defaultValue={shift?.notes ?? ""} />
        </label>
      </div>
    </ActionForm>
  );
}

function PersonPicker({ picker, onDone }: { picker: Picker; onDone: () => void }) {
  const [list, setList] = useState<RotaCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRefused, setShowRefused] = useState(false);

  useEffect(() => {
    let live = true;
    getCandidatesAction(picker.shift.id).then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else setList(r.candidates ?? []);
    });
    return () => {
      live = false;
    };
  }, [picker.shift.id]);

  if (error) return <p className="form-error">{error}</p>;
  if (!list) return <p className="text-sm text-white/60" role="status">Checking who can work this shift…</p>;

  const can = list.filter((c) => !c.refusal);
  const cannot = list.filter((c) => c.refusal);

  if (picker.mode === "offer") {
    return (
      <ActionForm action={offerShiftAction} hidden={{ shift_id: picker.shift.id }} label="Send texts" savingLabel="Sending…" savedLabel="Sent" showOk className="space-y-3">
        <p className="text-xs text-white/55">Tick who to text. Each text uses one credit. Only people who could take this shift are listed.</p>
        {can.length === 0 ? <p className="text-sm text-white/60">Nobody in your branches can take this shift.</p> : null}
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {can.map((c) => (
            <li key={c.personId}>
              <label className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2">
                <input type="checkbox" name="person_id" value={c.personId} className="mt-1" />
                <CandidateText c={c} />
              </label>
            </li>
          ))}
        </ul>
      </ActionForm>
    );
  }

  const action = picker.mode === "handover" ? handoverAction : assignAction;
  const hidden: Record<string, string> =
    picker.mode === "handover"
      ? { shift_id: picker.shift.id, assignment_id: picker.assignment.id, from_person_id: picker.assignment.personId }
      : { shift_id: picker.shift.id };
  return (
    <div className="space-y-3">
      {can.length === 0 ? <p className="text-sm text-white/60">Nobody in your branches can work this shift.</p> : null}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {can.map((c) => (
          <li key={c.personId} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
            <CandidateText c={c} />
            <ActionForm
              action={action}
              hidden={{ ...hidden, person_id: c.personId }}
              label={picker.mode === "handover" ? "Hand over" : "Add"}
              buttonClassName={c.warnings.length ? "btn-outline px-3 py-1.5 text-xs" : "btn-primary px-3 py-1.5 text-xs"}
              className=""
              showOk
              onDone={onDone}
              onDoneDelayMs={2500}
              confirm={c.warnings.length ? `${c.name}: ${c.warnings.map((w) => w.text).join(" ")} Add anyway? This is recorded.` : undefined}
            />
          </li>
        ))}
      </ul>
      {cannot.length ? (
        <div>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowRefused((v) => !v)}>
            {showRefused ? "Hide" : "Show"} {cannot.length} who cannot work it
          </button>
          {showRefused ? (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {cannot.map((c) => (
                <li key={c.personId} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/55">
                  {/* The reason already names the person (the database's own words). */}
                  {c.refusal}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CandidateText({ c }: { c: RotaCandidate }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm text-white/90">{c.name}</span>
      <span className="block text-xs text-white/50">{[c.jobTitle, c.branchName].filter(Boolean).join(" · ")}</span>
      {c.warnings.map((w, i) => (
        <span key={i} className="block text-xs text-amber-300">
          {w.text}
        </span>
      ))}
    </span>
  );
}

function SwapForm({
  from,
  options,
  onDone,
}: {
  from: { shift: RotaShift; assignment: RotaAssignment };
  options: { shift: RotaShift; assignment: RotaAssignment }[];
  onDone: () => void;
}) {
  if (options.length === 0) return <p className="text-sm text-white/60">There is nobody else on this week's rota to swap with.</p>;
  return (
    <ActionForm action={swapAction} hidden={{ assignment_a: from.assignment.id }} label="Swap" onDone={onDone} className="space-y-3">
      <p className="text-sm text-white/70">
        {from.assignment.name} on {dayLabel(from.shift.shiftDate)}, {from.shift.startTime} to {from.shift.endTime}, swaps with:
      </p>
      <select name="assignment_b" aria-label="Swap with" required defaultValue="">
        <option value="" disabled>
          Choose a person and shift
        </option>
        {options.map((o) => (
          <option key={o.assignment.id} value={o.assignment.id}>
            {o.assignment.name}: {dayLabel(o.shift.shiftDate)}, {o.shift.startTime} to {o.shift.endTime}
          </option>
        ))}
      </select>
      <p className="text-xs text-white/50">Both people must be able to work each other's shift, or the swap is refused.</p>
    </ActionForm>
  );
}
