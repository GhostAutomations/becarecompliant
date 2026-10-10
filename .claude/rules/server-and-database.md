---
paths:
  - "supabase/**"
  - "lib/**/*.ts"
  - "lib/**/*.tsx"
  - "app/api/**"
  - "app/**/actions.ts"
  - "middleware.ts"
---

# Server code and the database

- Supabase project `bgrtcvyjuwopunpnudeu` only. Check it before every SQL call.
- Migrations: the next number in `supabase/migrations`, written to be safe to run twice where
  possible (`if not exists`, `create or replace`), applied through the Supabase tools before the
  code that needs them is pushed, then the security advisor: stop on any ERROR, judge only new WARN
  and INFO lints. Views use `security_invoker` (`lib/db/views-read-as-caller.test.ts` guards this).
- RLS on every table, through the helpers (`is_company_member`, `is_company_admin`,
  `is_platform_admin`, `is_branch_member`, `is_company_wide`).
- SECURITY DEFINER functions: `set search_path = public, pg_temp`, check the caller inside, and
  revoke execute from public, anon and authenticated when only triggers use them.
- Prove RLS without a login, inside a rolled back transaction:
  `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<profile id>","role":"authenticated"}'; ...; rollback;`
  Count the user's own rows first as a positive control, or a pass proves nothing.
- Test writes go on Bevan. Any change to Thistle's data needs Phil's go. Wrap risky proofs in
  `begin; ... rollback;`.
- Realtime tables need `REPLICA IDENTITY FULL` for UPDATE and DELETE events to reach subscribers.
- Branches are never deleted: their foreign keys cascade Regulation 73 and 80 records. Only an
  unused branch can be removed (`remove_unused_branch`).
- Seeds: "all companies" means the `seed_company_*` functions as well as existing rows. An all NULL
  `VALUES` column types as text, so cast it.
- Evidence is immutable; a correction is a new entry.
- Today in SQL is `(now() at time zone 'Europe/London')::date`, never `current_date`.
- "use server" files export only async functions; constants and types live in `lib/`.
- Background jobs return 500 when a run fails, never 200, and are checked by reading the rows they
  should have changed.
- Crons and webhooks fail closed without their secret; webhooks verify the signature on the raw
  body; webhook paths go in `PUBLIC_PATHS` (`lib/supabase/middleware.ts`).
- Sessions: one desktop and one mobile per user (`claim_session`, `user_sessions` keyed on user and
  device kind, `lib/auth/device-kind.ts`).
- The service role client is server only; secrets are never NEXT_PUBLIC_.
- Files live in private buckets, released through short lived signed URLs, with downloads audit
  logged.
- Unit tests run with `node --experimental-strip-types --test` and no path aliases: keep the logic
  you test in importless modules.
