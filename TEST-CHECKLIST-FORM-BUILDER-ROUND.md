# Test checklist: form builder round (Phase 13, 2 Oct 2026)

Phil's request: delete a library form ("Platform Audit"), send a form to a single company, and an
AI import from a link, PDF, Word, Excel or picture, for the founder and every company.
Decisions by popup 2 Oct: Phase 13 now; Delete only when no company holds it (Archive otherwise);
Give to any company, including ones without the form; AI import for founder (free) and every
company (1 AI credit), draft lands in the builder, nothing saved until Save.

Built: migration 0373 (founder_delete_form_template, founder_give_form_template),
lib/form-builder/ai-import.ts (+ 7 unit tests), lib/form-builder/ai-import-actions.ts,
components/form-builder/ai-import-dialog.tsx, components/founder/library-give.tsx, Delete on
the template library, runAi takes attachments and a null company (founder).

- FB1 Founder > Form templates: each row says who holds it ("no company has it yet" / "held by N
  companies"); Platform Audit shows Delete; a held form (Supervision) shows no Delete.
- FB2 Delete Platform Audit: Delete, type DELETE, Delete for good. It leaves the list.
- FB3 A form no company holds: Send to companies shows "Give it to a company that does not have it"
  with every company that lacks it (no demos, no deleted companies), nothing ticked.
- FB4 Give a test form to Bevan only: "Added to Bevan Care Ltd." Bevan's Settings, Forms lists it;
  the page now shows Bevan under "Companies that have it" and not in the give list.
- FB5 Founder AI import, PDF: open a library form, Import with AI, upload a PDF form. The questions
  appear in sections; nothing saved until Save template.
- FB6 Founder AI import, Word, Excel and a photo: same as FB5 for a .docx, a .xlsx and a JPG.
- FB7 AI import from a link: a public Google Form link drafts its questions; a link that needs a
  sign in says so and drafts nothing.
- FB8 Company AI import (Bevan Admin, or a demo login): Import (1 AI credit) drafts the form into the
  draft; the AI credits figure goes down by 1; a refused import (bad file) keeps the choices and
  spends nothing.
- FB9 Add vs Replace: on a form with questions, Add puts the imported ones after; Replace swaps them.
