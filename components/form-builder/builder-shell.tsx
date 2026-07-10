"use client";

/**
 * Be Care Compliant — Form builder shell (Phase 5).
 *
 * Orchestrates the builder: holds the working schema, an Edit / Preview toggle,
 * builder-time validation, and the Save / Publish / Discard flow. The live preview
 * mounts the SAME shared renderer completers use (components/forms/form-renderer),
 * so what an author sees is exactly what will be stored as Evidence.
 *
 * Draft/publish rules (enforced server-side by the 0038 RPCs, mirrored here for UX):
 *  - Company forms edit a DRAFT version; Publish promotes it to the current version;
 *    a published version is never mutated in place, so existing Evidence is safe.
 *  - Master templates (Founder) are edited and saved in place.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/forms/form-renderer";
import { type FieldType, type FormField, type FormSchema } from "@/lib/form-schema";
import type { BankQuestion, FormVersionRow, Population } from "@/lib/form-builder/types";
import {
  addField,
  addSection,
  hasBlockingErrors,
  insertField,
  insertFieldFromBank,
  moveField,
  moveSection,
  removeField,
  removeSection,
  reorderFieldInSection,
  reorderSection,
  updateField,
  updateSection,
  validateSchema,
} from "@/lib/form-builder/schema-ops";
import {
  discardDraft,
  ensureDraft,
  publishForm,
  saveDraft,
  saveTemplate,
} from "@/lib/form-builder/actions";
import SectionEditor from "./section-editor";
import VersionHistory from "./version-history";
import ContentOutline from "./content-outline";

type CompanyProps = {
  kind: "company";
  formId: string;
  name: string;
  population: Population;
  editable: boolean;
  draftVersionId: string | null;
  schema: FormSchema;
  currentVersion: number | null;
  versions: FormVersionRow[];
  bank?: BankQuestion[];
};

type TemplateProps = {
  kind: "template";
  templateId: string;
  name: string;
  population: Population;
  schema: FormSchema;
  version: number;
  bank?: BankQuestion[];
};

type Props = CompanyProps | TemplateProps;

const POP_LABEL: Record<Population, string> = {
  people: "People",
  service_users: "Service Users",
};

export default function BuilderShell(props: Props) {
  const router = useRouter();
  const readOnly = props.kind === "company" && !props.editable;

  const [schema, setSchema] = useState<FormSchema>(props.schema);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [sectionDrag, setSectionDrag] = useState<number | null>(null);
  const bank = props.bank;

  const issues = useMemo(() => validateSchema(schema), [schema]);
  const blocked = hasBlockingErrors(issues);
  const allFields: FormField[] = useMemo(
    () => schema.sections.flatMap((s) => s.fields),
    [schema],
  );

  function mutate(next: FormSchema) {
    setSchema(next);
    setDirty(true);
    setMessage(null);
  }

  // ---- Save / Publish / Discard --------------------------------------------

  function doSave(after?: () => void) {
    startTransition(async () => {
      const res =
        props.kind === "company"
          ? await saveDraft(props.draftVersionId as string, schema)
          : await saveTemplate(props.templateId, props.name, schema);
      if (res.error) {
        setMessage({ error: res.error });
      } else {
        setDirty(false);
        setMessage({ ok: res.ok ?? "Saved." });
        if (after) after();
        else router.refresh();
      }
    });
  }

  function doPublish() {
    if (props.kind !== "company") return;
    startTransition(async () => {
      const saveRes = await saveDraft(props.draftVersionId as string, schema);
      if (saveRes.error) {
        setMessage({ error: saveRes.error });
        return;
      }
      const res = await publishForm(props.draftVersionId as string, props.formId);
      if (res.error) setMessage({ error: res.error });
      else {
        setDirty(false);
        setMessage({ ok: res.ok ?? "Published." });
        router.refresh();
      }
    });
  }

  function doDiscard() {
    if (props.kind !== "company" || !props.draftVersionId) return;
    if (!confirm("Discard this draft? Any unpublished changes will be lost.")) return;
    startTransition(async () => {
      const res = await discardDraft(props.draftVersionId as string, props.formId);
      if (res.error) setMessage({ error: res.error });
      else if (res.redirectTo) router.replace(res.redirectTo);
    });
  }

  function doStartEditing() {
    if (props.kind !== "company") return;
    startTransition(async () => {
      const res = await ensureDraft(props.formId);
      if (res.error) setMessage({ error: res.error });
      else router.refresh();
    });
  }

  // ---- Read-only published view (no open draft) ----------------------------

  if (readOnly) {
    return (
      <div className="space-y-6">
        <StatusBar
          kind="company"
          population={props.population}
          currentVersion={props.currentVersion}
          hasDraft={false}
        />
        <div className="glass-card p-5">
          <p className="text-sm text-white/70">
            {props.currentVersion == null
              ? "This form has no published version yet."
              : `Viewing published version ${props.currentVersion}. Editing creates a new draft; the published version and all existing Evidence stay exactly as they are.`}
          </p>
          <button
            type="button"
            onClick={doStartEditing}
            disabled={pending}
            className="btn-primary mt-4 px-4 py-2 text-sm"
          >
            {pending ? "Preparing…" : "Edit form"}
          </button>
          {message?.error && <p className="form-error">{message.error}</p>}
        </div>

        <div className="glass-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-white/80">Preview</h2>
          <FormRenderer schema={schema} disabled />
        </div>

        <VersionHistory versions={props.versions} />
      </div>
    );
  }

  // ---- Editable builder ----------------------------------------------------

  return (
    <div className="space-y-6">
      <StatusBar
        kind={props.kind}
        population={props.population}
        currentVersion={props.kind === "company" ? props.currentVersion : props.version}
        hasDraft={props.kind === "company"}
        isTemplate={props.kind === "template"}
      />

      {/* Toolbar */}
      <div className="glass-card sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="inline-flex rounded-xl bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "edit" ? "bg-white/15 text-white" : "text-white/60"
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "preview" ? "bg-white/15 text-white" : "text-white/60"
            }`}
          >
            Preview
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
          {message?.ok && !dirty && <span className="text-xs text-emerald-300">{message.ok}</span>}
          <button
            type="button"
            onClick={() => doSave()}
            disabled={pending}
            className="btn-outline px-3 py-2 text-sm"
          >
            {pending ? "Saving…" : props.kind === "template" ? "Save template" : "Save draft"}
          </button>
          {props.kind === "company" && (
            <>
              <button
                type="button"
                onClick={doPublish}
                disabled={pending || blocked}
                title={blocked ? "Fix the highlighted problems first" : undefined}
                className="btn-primary px-3 py-2 text-sm"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={doDiscard}
                disabled={pending}
                className="btn-ghost px-3 py-2 text-sm text-red-300"
              >
                Discard draft
              </button>
            </>
          )}
        </div>
      </div>

      {message?.error && (
        <div className="glass-card border border-red-400/30 p-4">
          <p className="form-error mt-0">{message.error}</p>
        </div>
      )}

      {/* Validation summary */}
      {issues.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            {blocked ? "Fix before publishing" : "Notes"}
          </p>
          <ul className="mt-2 space-y-1">
            {issues.map((iss, i) => (
              <li
                key={i}
                className={`text-sm ${iss.level === "error" ? "text-red-300" : "text-amber-300"}`}
              >
                {iss.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "edit" ? (
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
          <aside className="mb-4 hidden lg:mb-0 lg:block">
            <div className="sticky top-20">
              <ContentOutline schema={schema} />
            </div>
          </aside>
          <div className="space-y-4">
            {schema.sections.map((section, i) => (
              <div
                key={section.id}
                onDragOver={(e) => {
                  if (sectionDrag != null) e.preventDefault();
                }}
                onDrop={() => {
                  if (sectionDrag != null) mutate(reorderSection(schema, sectionDrag, i));
                  setSectionDrag(null);
                }}
              >
                <SectionEditor
                  section={section}
                  allFields={allFields}
                  index={i}
                  count={schema.sections.length}
                  bank={bank}
                  dragHandle={
                    <span
                      draggable
                      onDragStart={() => setSectionDrag(i)}
                      onDragEnd={() => setSectionDrag(null)}
                      className="cursor-grab select-none text-white/40"
                      aria-label="Drag to reorder section"
                      title="Drag to reorder section"
                    >
                      ⠿
                    </span>
                  }
                  onChangeSection={(patch) => mutate(updateSection(schema, section.id, patch))}
                  onMoveSection={(dir) => mutate(moveSection(schema, section.id, dir))}
                  onRemoveSection={() => mutate(removeSection(schema, section.id))}
                  onAddField={(type: FieldType) => mutate(addField(schema, section.id, type))}
                  onInsertField={(at, type) => mutate(insertField(schema, section.id, at, type))}
                  onInsertBank={(at, q) =>
                    mutate(
                      insertFieldFromBank(schema, section.id, at, {
                        label: q.label,
                        fieldType: q.fieldType,
                        options: q.options,
                        helpText: q.helpText,
                      }),
                    )
                  }
                  onReorderFields={(from, to) =>
                    mutate(reorderFieldInSection(schema, section.id, from, to))
                  }
                  onChangeField={(key, patch) => mutate(updateField(schema, section.id, key, patch))}
                  onMoveField={(key, dir) => mutate(moveField(schema, section.id, key, dir))}
                  onRemoveField={(key) => mutate(removeField(schema, section.id, key))}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => mutate(addSection(schema))}
              className="btn-outline px-4 py-2 text-sm"
            >
              Add section
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card p-5">
          <p className="mb-4 text-xs text-white/50">
            Live preview. Try the fields, including any conditional logic. Nothing here is saved.
          </p>
          <FormRenderer schema={schema} />
        </div>
      )}

      {props.kind === "company" && <VersionHistory versions={props.versions} />}
    </div>
  );
}

function StatusBar({
  kind,
  population,
  currentVersion,
  hasDraft,
  isTemplate,
}: {
  kind: "company" | "template";
  population: Population;
  currentVersion: number | null;
  hasDraft: boolean;
  isTemplate?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="pill pill-neutral">{POP_LABEL[population]}</span>
      {isTemplate ? (
        <span className="pill pill-neutral">Master template</span>
      ) : currentVersion == null ? (
        <span className="pill pill-amber">Not published</span>
      ) : (
        <span className="pill pill-green">Published v{currentVersion}</span>
      )}
      {kind === "company" && hasDraft && <span className="pill pill-amber">Draft open</span>}
    </div>
  );
}
