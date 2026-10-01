-- 0360 DEF-094: THE FORM LIBRARY NO LONGER NAMES THISTLE CARE (Phil, 2026-10-01, popup: fix now).
--
-- Spot Check, Supervision and Probation Review came into the library from Thistle's own forms and
-- kept Thistle's name in six questions, so every company seeded from the library asked its carers
-- whether they would recommend Thistle Care as an employer. The library now says "the company",
-- and the copies already given to other companies are corrected the same way. Thistle Care Ltd's
-- own forms are left exactly as they are, and no Evidence is touched: a completed form keeps the
-- wording it was completed against.

create or replace function pg_temp.without_thistle(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(t,
    'Thistle Care Ltd has', 'the company has'),
    'Thistle Care''s', 'the company''s'),
    'that Thistle Care have provided', 'that the company has provided'),
    'Thistle Care ensure that', 'The company ensures that'),
    'recommend Thistle Care as', 'recommend the company as'),
    'Thistle Care', 'the company')
$$;

update public.form_templates
   set schema = pg_temp.without_thistle(schema::text)::jsonb
 where schema::text like '%Thistle Care%';

update public.forms f
   set library_schema = pg_temp.without_thistle(f.library_schema::text)::jsonb
 where f.company_id <> 'eae26e83-1e41-472b-abc0-e2b39b907e49'
   and f.library_schema::text like '%Thistle Care%';

update public.form_versions fv
   set schema = pg_temp.without_thistle(fv.schema::text)::jsonb
  from public.forms f
 where f.id = fv.form_id
   and f.company_id <> 'eae26e83-1e41-472b-abc0-e2b39b907e49'
   and fv.schema::text like '%Thistle Care%';
