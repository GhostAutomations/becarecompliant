-- 0470: a Branch Manager sees only the tickets they raised (Phil, 2026-10-14;
-- docs/decisions/tickets.md).
--
-- WHO SEES WHICH TICKETS. The Founder sees every ticket in every company. Company Admin,
-- Responsible Individual and Registered Manager see every ticket in their own company. Everyone
-- else, the Branch Manager included, sees only the tickets they raised themselves: open, in
-- progress and resolved. This was 0432's rule with 'manager' in the see all list; it comes out.
--
-- The same function decides the ticket rows (support_tickets_select), their messages
-- (support_ticket_messages_select) and who may reply (reply_support_ticket), so all three follow.
-- As 0432 otherwise, word for word.

create or replace function public.can_see_support_ticket(p_company uuid, p_raised_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.company_id = p_company
        and ( p.id = p_raised_by
           or p.role in ('company_admin', 'registered_individual', 'registered_manager') )
    );
$$;
