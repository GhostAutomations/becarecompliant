-- 0222_a_branch_can_share_the_office_address
-- Most agencies run every branch out of one office. Thistle has Cardiff and Newport
-- because it cares for people in those areas, not because it has premises there, and
-- until now the only way to say that was to type the same address into all three --
-- which goes wrong the day the company moves.
--
-- A branch can now SHARE the office address instead of holding a copy. The address is
-- resolved when it is used (lib/branches/office-address.ts), so there is one address
-- and everything follows it.
--
-- Two invariants are enforced here rather than trusted to the UI:
--   * the office (kind = 'team') can never share an address with itself;
--   * a sharing branch holds no address of its own, so a stale copy cannot survive
--     the toggle being turned on.
--
-- Default TRUE for new branches, deliberately: one office is the common case, and the
-- alternative default leaves a new company unable to book a formal absence meeting at
-- a branch until someone notices the address is blank. A company with real premises
-- unticks it and types the address.
--
-- Backfill: existing branches with no address of their own start sharing. They had
-- nothing before, and a formal meeting booked at them was REFUSED ("That office has
-- no address yet"), so this only adds. A branch that already has its own address is
-- left alone.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.branches
  add column if not exists uses_office_address boolean not null default true;

update public.branches
   set uses_office_address = false
 where kind = 'team'
    or (address is not null and btrim(address) <> '');

update public.branches
   set uses_office_address = true
 where kind <> 'team'
   and (address is null or btrim(address) = '');

update public.branches
   set address = null
 where uses_office_address;

alter table public.branches
  drop constraint if exists branches_office_address_share_check;
alter table public.branches
  add constraint branches_office_address_share_check
  check (
    not uses_office_address
    or (kind <> 'team' and address is null)
  );
