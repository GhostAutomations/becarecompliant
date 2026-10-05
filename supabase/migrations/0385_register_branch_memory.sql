-- THE BRANCH EACH REGISTER WAS LAST ON, REMEMBERED FOR THE SIGN IN.
--
-- Phil, 2026-10-05: "we remember what branch they were last on for that screen ... they won't
-- cross over." People compliance, Training and Service User compliance each remember their own
-- branch: leaving People on Newport and Service Users on Cardiff brings each back where it was.
--
-- Stored on the account, not the browser (popup: "On their account"), so a manager moving from
-- the office PC to her phone mid shift picks up where she was. But it lasts for ONE SIGN IN
-- (popup: "Back to primary"): a new sign in starts on the primary branch again. So the memory
-- carries the auth session it was written in, and a read from a different session is no memory.
-- The session id comes from the caller's own verified JWT, never from the client.
--
-- Shape: {"session_id": "<uuid>", "people": "<branch uuid|all>", "training": ..., "service_users": ...}
alter table public.profiles
  add column if not exists register_branch_memory jsonb;

create or replace function public.set_register_branch(p_screen text, p_branch text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session text := auth.jwt() ->> 'session_id';
  v_company uuid;
  v_mem jsonb;
begin
  if auth.uid() is null or v_session is null then return; end if;
  if p_screen not in ('people', 'training', 'service_users') then
    raise exception 'invalid register screen';
  end if;
  select company_id, register_branch_memory into v_company, v_mem from public.profiles where id = auth.uid();
  if v_company is null then return; end if;
  -- 'all' is a choice on People and Training. Anything else must be a branch of the caller's
  -- own company; whether they may SEE it is decided again on every read by the register.
  if p_branch = 'all' then
    if p_screen = 'service_users' then raise exception 'invalid branch'; end if;
  elsif not exists (select 1 from public.branches where id::text = p_branch and company_id = v_company) then
    raise exception 'invalid branch';
  end if;
  if v_mem is null or v_mem ->> 'session_id' is distinct from v_session then
    v_mem := jsonb_build_object('session_id', v_session);
  end if;
  update public.profiles
    set register_branch_memory = v_mem || jsonb_build_object(p_screen, p_branch)
    where id = auth.uid();
end;
$$;

create or replace function public.get_register_branch(p_screen text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when register_branch_memory ->> 'session_id' = (auth.jwt() ->> 'session_id')
      then register_branch_memory ->> p_screen
  end
  from public.profiles
  where id = auth.uid();
$$;

revoke all on function public.set_register_branch(text, text) from public;
revoke all on function public.get_register_branch(text) from public;
grant execute on function public.set_register_branch(text, text) to authenticated;
grant execute on function public.get_register_branch(text) to authenticated;
