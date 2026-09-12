-- Be Care Compliant — Customer Satisfaction gets its own section on the Individual Plan Review.
--
-- Phil, 2026-09-12: "on the review have the questions in a tile titled Customer Satisfaction".
--
-- The questions that FEED the PQS customer satisfaction score were scattered through a
-- section called "Feedback, Call Times and Outcomes", mixed in with questions that score
-- nothing. Nobody filling the form in could tell which answers became the number the
-- regulator reads, and nobody reading the number could see which questions made it.
--
-- The three that count now sit together under their own heading, each with the follow up
-- it opens:
--
--   Does this match the calls being delivered?     (with the schedule shown above it)
--   Do the call times / visit quantities match the setup / previous review?
--   Do the call times suit the individual at present?
--
-- What is left behind keeps the questions that are worth asking but score nothing, so the
-- section is renamed from "Feedback, Call Times and Outcomes" to "Feedback and Outcomes" —
-- the call times have moved out and a heading that lies about its contents is how a form
-- stops being read.
--
-- This is the same change as lib/service-users/satisfaction.ts, from the other side: the
-- satisfaction score dropped "Do you wish to give any feedback on your Care Workers?",
-- which measured whether somebody wanted to speak rather than whether they were happy, and
-- took "does the schedule match what is actually arriving?" in its place.
--
-- v1 edited in place for the master library and every company, guarded on Evidence.

begin;

do $$
declare
  n integer;
begin
  select count(*) into n
  from evidence e join forms f on f.id = e.form_id
  where f.key = 'care_plan_review';
  if n > 0 then
    raise exception
      'Refusing to edit care_plan_review in place: % Evidence row(s) exist. Publish a v2 instead.', n;
  end if;
end $$;

create or replace function _resection_review(p_schema jsonb) returns jsonb
language plpgsql as $$
declare
  -- In the order they should be read: the schedule, then whether it matches, then the two
  -- call time questions, each immediately followed by whatever it opens.
  satisfaction_keys text[] := array[
    'current_care_schedule', 'schedule_matches', 'schedule_changes',
    'review_previous_setup', 'social_worker_review',
    'call_times_suit', 'times_not_suiting', 'times_that_suit'
  ];
  sec jsonb;
  fld jsonb;
  k text;
  sat_fields jsonb := '[]'::jsonb;
  sections jsonb := '[]'::jsonb;
  kept jsonb;
  title text;
  inserted boolean := false;
begin
  -- Lift the satisfaction questions out, in the order named above rather than the order
  -- they happened to sit in.
  foreach k in array satisfaction_keys loop
    for sec in select * from jsonb_array_elements(p_schema->'sections') loop
      for fld in select * from jsonb_array_elements(sec->'fields') loop
        if fld->>'key' = k then
          sat_fields := sat_fields || jsonb_build_array(fld);
        end if;
      end loop;
    end loop;
  end loop;

  if jsonb_array_length(sat_fields) = 0 then
    return p_schema;  -- nothing to move; leave the form exactly as it is
  end if;

  for sec in select * from jsonb_array_elements(p_schema->'sections') loop
    kept := '[]'::jsonb;
    for fld in select * from jsonb_array_elements(sec->'fields') loop
      if not (fld->>'key' = any(satisfaction_keys)) then
        kept := kept || jsonb_build_array(fld);
      end if;
    end loop;

    title := sec->>'title';
    if title = 'Feedback, Call Times and Outcomes' then
      -- The call times have moved out, so the heading stops claiming them.
      sec := jsonb_set(sec, '{title}', '"Feedback and Outcomes"');
    end if;

    -- Customer Satisfaction goes immediately BEFORE whatever section held these questions,
    -- so the reviewer reads it at the same point in the conversation as before.
    if not inserted and title = 'Feedback, Call Times and Outcomes' then
      sections := sections || jsonb_build_array(jsonb_build_object(
        'id', 'customer_satisfaction',
        'title', 'Customer Satisfaction',
        'description', 'These answers are the customer satisfaction score in the PQS return.',
        'fields', sat_fields
      ));
      inserted := true;
    end if;

    if jsonb_array_length(kept) > 0 then
      sections := sections || jsonb_build_array(jsonb_set(sec, '{fields}', kept));
    end if;
  end loop;

  if not inserted then
    sections := sections || jsonb_build_array(jsonb_build_object(
      'id', 'customer_satisfaction',
      'title', 'Customer Satisfaction',
      'description', 'These answers are the customer satisfaction score in the PQS return.',
      'fields', sat_fields
    ));
  end if;

  return jsonb_set(p_schema, '{sections}', sections);
end $$;

update form_templates
set schema = _resection_review(schema)
where key = 'care_plan_review';

update form_versions fv
set schema = _resection_review(fv.schema)
from forms f
where f.id = fv.form_id
  and f.key = 'care_plan_review'
  and fv.version = f.current_version;

-- The library schema each company was handed moves with it, or every copy would read as
-- edited by the company and stop receiving improvements (lib/forms/library-sync.ts).
update forms f
set library_schema = _resection_review(f.library_schema)
where f.key = 'care_plan_review' and f.library_schema is not null;

drop function _resection_review(jsonb);

do $$
declare
  n integer;
begin
  select count(*) into n
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s
  where f.key = 'care_plan_review' and fv.version = f.current_version
    and s->>'title' = 'Customer Satisfaction';
  if n <> (select count(*) from forms where key = 'care_plan_review') then
    raise exception 'Not every care_plan_review gained a Customer Satisfaction section.';
  end if;
end $$;

commit;
