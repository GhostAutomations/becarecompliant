# Test checklist: the letter editor (Job 2 Part B, 2026-10-12)

Phil's decisions: `docs/decisions/letter-editor.md`. TipTap 3.31.4 (MIT), approved by popup. No
migration: letter text is now LETTER HTML (lib/letters/rich-text.ts), and old plain text letters and
templates are read by the rules they always had.

Local render (12 Oct, before deploying): a letter using every format (Heading, Subheading, bold,
italic, underline, a bulleted and a numbered list, Small and Large text, the meeting details lines,
an empty line of space) printed each one on both the invitation and the outcome letter PDF. First
render found the headings not bold (each run set normal weight over the heading); fixed and
rendered again. An old plain text invitation, signed and unsigned, renders pixel for pixel the same
as before the change. npm audit: the same 5 findings as before TipTap (none from it).

| # | Check | Result |
|---|-------|--------|
| E1 | Book meeting (Bevan): the editor shows the standard letter formatted; each toolbar control (Normal text, Heading, Subheading, Small, Normal, Large, B, I, U, bulleted, numbered) changes the words, and the PDF on the right shows the same | Not tested |
| E2 | Book meeting: Save to history keeps a PDF with the formatting; Back to the standard letter still works | Not tested |
| E3 | Outcome letter, final look: formatting made in the editor prints on the PDF, and on the kept letter | Not tested |
| E4 | Meeting form, Generate outcome: the drafted letter opens in the editor, edits show in the PDF beside it, Save meeting keeps them | Not tested |
| E5 | Settings, Letters: the invitation and outcome templates show a PDF preview with this company's letterhead; formatting saved in a template carries into a new Book meeting letter | Not tested |
| E6 | Settings, Letters: an email only template (the chairing copy) previews formatted, on the dark screen; Insert a detail puts the token at the cursor; Use the standard wording still resets | Not tested |
| E7 | Pasting from Word (bold, a bulleted list, a coloured big font) keeps bold and the list as a list, and drops the colour and font | Not tested |
| E8 | An old plain text letter or draft opens in the editor as paragraphs and lists, and its PDF is unchanged | Not tested |
| E9 | Phone width: the toolbar wraps and the editor fits with no sideways scroll | Not tested |
| E10 | No dashes in any new screen text; the emails sent from formatted templates show the formatting | Not tested |
