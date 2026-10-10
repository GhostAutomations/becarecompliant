# Reg73

> Regulation 73 (RISCA Wales) Responsible Individual branch visit report, pre-filled from site data

Reg 73 report = the RISCA **Responsible Individual branch visit** (RI quarterly quality-of-care visit). Phil uploaded two examples (Cardiff, Newport) 2026-07-30. BUILT 2026-07-30 (migration 0157). It is the RI's own form, mostly narrative + yes/no, that we PRE-FILL with site data.

DESIGN (Phil, all recommended): a pre-filled form the RI completes + signs (not a read-only pack); each visit STORED per branch as a record with history (next visit auto-fills "previous actions and status"); AI drafts the narrative sections, RI edits (metered via runAi).

MODEL: table `reg73_visits` (company_id, branch_id, status draft|submitted, data jsonb = all fields, prefill jsonb = pulled-data snapshot, ri_name, start/end date, signature_path, reference, submitted_at). RLS: read = company member; write = platform/company admin or **registered_individual / registered_manager** (new RI roles; note profiles.role currently only has admin/manager/staff/team_member in use, RI roles valid but unassigned so only admins can write until an RI is set).

AUTO-FILL reuses existing engines (NO parallel code): `getPqsMeasures({companyId,companyName,branchId,branchName,window})` from lib/export/on-time now returns ALL the rates by name (Mandatory training, Safeguarding training, Social Care Wales registration, Supervision, Care Plan Review, Customer satisfaction, Personal outcomes); overdue counts from `person_check_status` (check_name + rag='red' per branch — Spot Check + Supervision are the KPI dashboard figures); complaints from the complaints table (last 3 months, by concern_type); staffing from people job_title; previous submitted visit's data. AI = `runAi({companyId, feature:'reg73', ...})` (lib/ai/anthropic) returns JSON, fills only EMPTY ai fields so it never overwrites RI edits; gated by AI credits (Enterprise/Diamond) via runAi, graceful error if none.

FILES: lib/reg73/{prefill.ts, spec.ts (REG73_SECTIONS + buildInitialData + reg73DataSummary, the ONE source shared by form + PDF; Sign off = just ri_signature, no confirm checkbox), data.ts (+ listReg73Signatories, listReg73VisitsForBranches), actions.ts (createReg73Draft/saveReg73/submitReg73/aiDraftReg73/refreshReg73Data/deleteReg73Visits), pdf-doc.ts}; components/reg73/{reg73-form.tsx, reg73-signature.tsx (3-option chooser: draw/upload/printed, sets sign_method + ri_signature), signature-pad.tsx (hi-res 960x280 canvas, quadratic smoothing -> PNG), reg73-reports-manager.tsx (checkbox list, bulk download-as-blob + delete), start-visit-button.tsx ("Run R73")}; app/(app)/reports/reg73/{page.tsx, [id]/page.tsx, reports/page.tsx}; app/api/reports/reg73/[id]/pdf/route.ts. Entry: Reports > Regulation 73, per branch; roles RI+admins+registered_manager edit, managers view.

TESTED 2026-07-30: three critique rounds, all PASS (Phil live walkthrough). Cold items logged to TEST-CHECKLIST-REG73.md (prefill accuracy, previous-visit autofill, PDF body, role/RLS gating, multi-branch, delete, audit trail, empty state).

KEY FIXES LEARNED THIS BUILD (permanent):
1. Signature IS embedded as an image in the PDF now (lib/export/pdf.tsx gained an `image` block {dataUrl,width,height}); black on PDF, gold-tracked only on screen.
2. AI draft: aiDraftReg73 RETURNS `{ok: JSON}` (no persist/redirect); client parses, sets controlled state, marks keys gold via a `_ai_fields` set. Mirrors the complaints AI-response pattern. Gold on screen, black on PDF.
3. Save button: use `useSavedFlash` (button goes green "Saved", reverts on form onChange), never a raw green span. See [save-button-behaviour](save-button-behaviour.md).
4. REMOUNT BUG (cost 2 critique rounds): the visit page had `<Reg73Form key={visit.updated_at}>`. Every server action bumps updated_at + revalidates -> new key -> the form REMOUNTS -> wipes the Saved state and the submit instance mid-scroll. FIX: dropped the key; made the data boxes (kpi_dashboard, prev_actions_status) controlled state; refreshReg73Data RETURNS the fresh boxes as JSON (client updates in place, no remount). Lesson: never key a stateful client form on a field that every mutation changes.
5. SCROLL: the app scrolls inside `<main class=overflow-y-auto>`, NOT the window — `window.scrollTo` is a no-op. Scroll `document.querySelector("main")`. And do NOT `router.refresh()` in the same effect: it re-applies Next's scroll restoration and undoes the scroll (rely on the server action's own revalidation to flip to read-only).

See [cardiff-pqs](cardiff-pqs.md), [tracking-drift](../process/tracking-drift.md).
