-- 0036_user_branches_primary
-- Split a user's branch assignments into a Primary Branch and Additional Branch Views
-- (Phil, 2026-07-10). Primary = the user's home branch: their name auto-fills when
-- that branch is chosen on Add (managers/supervisors). Additional views = branches
-- they can see but are NOT auto-filled into. Both grant visibility; only the primary
-- drives auto-fill (getBranchStaffMap filters to is_primary). One primary per user.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.user_branches
  add column if not exists is_primary boolean not null default false;

-- Backfill: make one existing row per user the primary (deterministic: earliest).
with ranked as (
  select user_id, branch_id,
         row_number() over (partition by user_id order by created_at, branch_id) as rn
  from public.user_branches
)
update public.user_branches ub
set is_primary = true
from ranked r
where ub.user_id = r.user_id and ub.branch_id = r.branch_id and r.rn = 1;

-- Exactly one primary branch per user.
create unique index if not exists user_branches_primary_uq
  on public.user_branches (user_id) where is_primary;
