-- 0409_one_rebuilt_copy_per_meeting
-- Phil, 2026-10-06: "It should all be automatic". A meeting booked before copies were kept gets
-- its invitation copy made automatically when its record or the Absence page is opened. Two pages
-- opened at the same moment must not make two, so the database allows one made-afterwards
-- (rebuilt) copy per meeting. Copies kept as letters go (invite, rearranged) are not limited.
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create unique index if not exists absence_meeting_letters_one_rebuilt
  on public.absence_meeting_letters (meeting_id)
  where rebuilt and meeting_id is not null;
