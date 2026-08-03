-- Be Care Compliant — 0167: what a custom register column SHOWS.
--
-- A custom column has always shown the check's next due date. An Admin can now point it at a
-- question on the check's own form instead, so a column can read "Licence expires 04 Mar 27" or
-- "Uniform: Issued" rather than a due date that means nothing to them.
--
-- NULL keeps today's behaviour (the next due date). Any other value is the KEY of a date or
-- choice question on the check's published form. The RAG COLOUR always comes from the check, so
-- the cell still means the same thing however it is labelled. Free text questions are deliberately
-- not offerable: a paragraph in a matrix cell helps nobody.
alter table public.check_definitions
  add column if not exists register_display_field_key text;

comment on column public.check_definitions.register_display_field_key is
  'Custom register column contents: null = the next due date; otherwise the key of a date or choice question on the check''s form, whose latest answer is shown. The RAG colour always comes from the check.';
