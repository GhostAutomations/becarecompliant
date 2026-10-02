-- 0369 — Demo sample data: the four overdue checks all in ONE branch, and no repeated service
-- user names (2 Oct 2026, found testing DM12).
--
-- Since readiness is worked out per branch (0363), a single overdue Care and Support check turns a
-- branch's theme to Action needed. The four overdue checks Phil asked for were spread across all
-- three branches, so the demo dashboard read "Action needed" on Cardiff, Newport and Swansea, the
-- very thing Phil said a demo must not look like (DM2, 1 Oct). They now all sit in Swansea
-- (index i where i % 3 = 2): Cardiff and Newport read on track, Swansea shows the red to drill into.
-- Service user names repeated every 20 (Iris Ellery in two branches); the surname now steps on.
-- Verified in a rolled back transaction: overdue Cardiff 0, Newport 0, Swansea 4; no repeated names.
do $do$
declare d text; d2 text;
begin
  select pg_get_functiondef('public.seed_demo_company(uuid,uuid)'::regprocedure) into d;
  d2 := replace(d, $x$array['p6:spot_check', 'p23:spot_check', 's11:care_plan_review', 's25:audit']$x$,
                   $x$array['p5:spot_check', 'p23:spot_check', 's11:care_plan_review', 's26:audit']$x$);
  d2 := replace(d2, $x$v_su_last[((i * 3) % array_length(v_su_last, 1)) + 1]$x$,
                    $x$v_su_last[((i * 3 + i / 20) % array_length(v_su_last, 1)) + 1]$x$);
  if d2 <> d then execute d2; end if;
end
$do$;
