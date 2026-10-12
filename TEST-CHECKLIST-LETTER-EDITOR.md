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
| E1 | Book meeting (Bevan): the editor shows the standard letter formatted; each toolbar control (Normal text, Heading, Subheading, Small, Normal, Large, B, I, U, bulleted, numbered) changes the words, and the PDF on the right shows the same | PASS after a fix (12 Oct, Bev Admin in Phil's Chrome, ZZ Stage One. First try: the editor opened EMPTY while the PDF showed the standard letter, because TipTap's setEditable reports an update by default and that read as an edit; fixed, pushed, retested: the standard letter loads formatted. Then with the real toolbar: B, I and U on "formal", Large on "invitation", Subheading, bulleted and numbered lists; the PDF beside it showed every one, the meeting details table and the signature) |
| E2 | Book meeting: Save to history keeps a PDF with the formatting; Back to the standard letter still works | PASS (Save to history booked a Stage 3 test meeting; the kept PDF shows formal bold and underlined, invitation larger, the bold subheading, both lists and the signature; the record copy is plain text with the lists as bullet and number lines) |
| E3 | Outcome letter, final look: formatting made in the editor prints on the PDF, and on the kept letter | PASS (ZZ Audit Walk Person's old plain draft: a Heading and a bold phrase added with the toolbar, the final look PDF showed both, Approve and send kept it as not emailed (test company); approved_body stored formatted, letter_text plain) |
| E4 | Meeting form, Generate outcome: the drafted letter opens in the editor, edits show in the PDF beside it, Save meeting keeps them | COVERED BY E3 AND E8 (Phil, popup 12 Oct: skipped, so no AI credit is spent and no test meeting is recorded; the meeting form uses the same editor component and the same outcome PDF code that passed in E3 and E8) |
| E5 | Settings, Letters: the invitation and outcome templates show a PDF preview with this company's letterhead; formatting saved in a template carries into a new Book meeting letter | PASS (Settings, Letters: the invitation template showed a PDF with Bevan's letterhead and example details; bold set on "right to be accompanied" and saved, the PDF preview showed it, and a new Book meeting letter carried it) |
| E6 | Settings, Letters: an email only template (the chairing copy) previews formatted, on the dark screen; Insert a detail puts the token at the cursor; Use the standard wording still resets | PASS (the chairing copy previewed with the example details on the dark screen; Insert a detail put {{meeting_date}} at the cursor; Use the standard wording put the invitation back, Bevan has no custom templates left) |
| E7 | Pasting from Word (bold, a bulleted list, a coloured big font) keeps bold and the list as a list, and drops the colour and font | PASS (a Word style paste: bold kept, the red colour, Comic Sans and 14pt dropped, the two Word bullet paragraphs became a real bulleted list without Word's drawn bullet) |
| E8 | An old plain text letter or draft opens in the editor as paragraphs and lists, and its PDF is unchanged | PASS (the old plain outcome draft opened in the editor as nine paragraphs and a real list; an old plain invitation renders pixel for pixel as before) |
| E9 | Phone width: the toolbar wraps and the editor fits with no sideways scroll | PASS (12 Oct, the app's browser at 375 wide, Bev Admin: Book meeting's toolbar wraps onto two rows and the editor fits; Settings, Letters shows the toolbar, the editor and the PDF underneath; no sideways scroll; nothing saved. On a phone the sheet is a scaled A4 page, so its text is small but wraps as the PDF does) |
| E10 | No dashes in any new screen text; the emails sent from formatted templates show the formatting | PASS by code and test (no dashes in the new screen text; emails use the same formatted rendering, covered by the rich-text tests; Bevan sends no email, so no live email was looked at) |
