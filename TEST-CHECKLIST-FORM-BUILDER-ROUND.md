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

- FB1 PASS 2 Oct (Claude in Chrome): holder counts on every row, Delete only on unheld forms, built in ones Archive only. Phil: the DELETE box was too wide and the pill, Archive/Restore and Delete did not line up; fixed (fixed slots, box w-28, department labels Complaints and Incidents). Same narrow box on the demo Delete now.
- FB2 PASS 2 Oct (Phil): Platform Audit deleted; checked in the database, gone.
- FB6 (Word) PASS 2 Oct (Phil, Birdie Audit Form.docx into a library form): every header field and all 21 questions in order and sections, Yes/No/NA choices, comments boxes, summary, signature; prefilled answer, carer comment, empty rows and Criteria headings left out. Phil chose three import improvements by popup: comment boxes labelled Comments, follow ups shown only when needed (showWhen), repeated questions flagged. Built with unit test.
- FB3/FB4 PASS 2 Oct (Phil gave Platform Audit to Thistle and Bevan; checked in the database: each holds it at version 1 with all 52 questions, library version 2 recorded, one form.library_given audit line each). Re-import showed the new tidying live: comment boxes labelled Comments, Follow-Up Date shown only when Follow-Up Required is Yes. The repeated question was kept, so both companies have it twice.
- FB10 Add a new column from Settings, Forms (Phil, 2 Oct, popup "Yes, as described"): on Bevan (Black) as Admin, the Platform Audit row's dropdown, "+ Add a new column", name Platform Audit, every 1 Months, Add column. Says "Added. Platform Audit is now a column on the Service Users register."; the dropdown shows Platform Audit; the Service Users register shows a Platform Audit column in a Simple branch and a Complex branch; a record's Platform Audit check has a Complete button that opens the form.
- FB10 PASS in part 2 Oct (Phil, Bevan): the column was made, linked and shown (checked in the database: Platform Audit every 3 months, show_on_register, 3 service users); Phil had to reselect it in the dropdown and the "added" text grew the row. Both fixed and pushed.
- FB11 Fill in automatically (Phil, 2 Oct: "Auditors Name, Branch/Location should be auto fill and there should be an option for this in the form builder"): in the builder, Auditors Name set to "The name of the person completing it", Branch/Location to "The record's branch", Service Users Name to "The record's name"; Save template; Send to companies to Thistle and Bevan; opening Platform Audit on a Bevan service user shows all three filled in and editable. A new AI import sets these by itself for questions worded like them.
