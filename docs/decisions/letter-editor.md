# The letter editor (Job 2 Part B)

Phil, 2026-10-12, standing:

- [stated] A proper editor for the letter text on the left, the PDF preview on the right, the PDF
  showing exactly the same formatting.
- [stated] Library: TipTap (MIT, 3.31.4 on 12 Oct 2026), approved by popup. It keeps only the
  formatting we allow, so text pasted from Word arrives clean.
- [stated] Where: Book meeting's letter, the outcome letter, and the company templates in Settings,
  Letters. The templates get a PDF preview too, so formatting set in a template carries into every
  letter made from it.
- [stated] Formatting: bold, italic, underline, bulleted and numbered lists, text size Small, Normal
  and Large (9, 10 and 12 point on the PDF), and two heading levels (Heading and Subheading).
- Existing templates and letters keep working: plain text is read as before (a blank line starts a
  paragraph, a bullet line is a list, "Label: value" lines are the meeting details).

## An outcome letter with no outcome in it (Phil, 2026-10-12)

- [found] Part B's merge took out the paragraph holding {{outcome_body}} before the drafted outcome
  was put in (its value was listed as empty), so every outcome letter drafted from Part B's deploy
  until the fix kept only the company's fixed wording. One letter was hit: Thistle, 12 Oct 13:29.
  Fixed: block tokens are filled first.
- [stated] If a letter ever comes back or is saved without the outcome (it says nothing beyond the
  fixed wording and the absences list), the manager is told plainly, it cannot be sent (refused on
  the server too), and a Regenerate the letter button redoes it. That cost is ours, not the
  customer's: the AI credit is spent and given straight back. A generation that comes back without
  its outcome is never kept and its credit is given back.
- [stated] The outcome letter box is laid out like Book meeting (Phil, 2026-10-12: "the editor next
  to each other"): the editor on the left, the real PDF on the right redrawn a second after the
  words or signature change, Approve and send, Save to file and Not now underneath. The separate
  "Check the letter" step is gone: the PDF beside the words is the final look.
- [stated] A discount reason's dates print in full ("12th October 2026"), like the rest of the letter.
