-- 0448: complaint responses as signed PDF letters (Phil, 2026-10-12, THE LIST 54,
-- docs/decisions/complaint-letters.md).
--
-- The Initial Response and the Complaint Response become letters on the company's letterhead, laid
-- out like the absence letters, with the same signing choices, and the PDF is kept on the complaint.
-- The AI draft is kept too, so opening the box again costs nothing.
--
-- 1. complaints.initial_response_draft and complaints.response_draft: the kept AI draft of each,
--    as letter HTML. Written by whoever may work the complaint (the existing complaints_update
--    policy), capped in size.
-- 2. complaint_responses.pdf_path and pdf_sha256: the letter as it went. The path always starts with
--    the company's own id (0443: a stored file stays in its company's folder).
-- Safe to run twice. No existing row changes.

alter table public.complaints add column if not exists initial_response_draft text;
alter table public.complaints add column if not exists response_draft text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'complaints_letter_drafts_size' and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_letter_drafts_size check (
        (initial_response_draft is null or length(initial_response_draft) <= 60000)
        and (response_draft is null or length(response_draft) <= 60000)
      );
  end if;
end $$;

alter table public.complaint_responses add column if not exists pdf_path text;
alter table public.complaint_responses add column if not exists pdf_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'complaint_responses_pdf_in_company' and conrelid = 'public.complaint_responses'::regclass
  ) then
    alter table public.complaint_responses
      add constraint complaint_responses_pdf_in_company
      check (pdf_path is null or pdf_path like company_id::text || '/%');
  end if;
end $$;
