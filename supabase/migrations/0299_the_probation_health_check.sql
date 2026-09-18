-- 0299_the_probation_health_check
--
-- Phil, 2026-09-18: "need to copy this form, but instead of week 3 and 8 it is week 4 and 8 ...
-- it wont be on the matrix, only in the employee record. and only completed during probation, so
-- once probation is passed, the button is not active but the completed forms still in evidence
-- and the dates complete visible in the tile."
-- Read off his 123FormBuilder form "TC - Staff Forms - Health Check - New Staff".
--
-- SHAPED LIKE THE ONE TO ONE (0295): a people check that is ad hoc, not recurring, and not on the
-- register. Nothing falls due and nothing goes red. It lives in the Checks section of the
-- employee's record and files Evidence there.
--
-- WEEK 4, NOT WEEK 3. The original offered Week 3 and Week 8; this one asks Week 4 and Week 8.
--
-- WHAT WAS DROPPED, on the same rule as the One to One:
--   Employees Name   -- the record it sits in IS the employee.
--   Recruiters Name  -- the Evidence is stamped with whoever completed it.
--   The signature's own Date -- Date of conversation is the completion date.
--   Branch Area      -- the branch is on the record, and typing it again is a second copy
--                       of it that can disagree.
--
-- Date of conversation is marked completionDate (0292), so the record shows the day the
-- conversation happened rather than the day somebody typed it up. That is also the date the
-- tile prints against Week 4 and Week 8.
--
-- The BUTTON is gated on probation in the record page, not here: a check definition has no
-- notion of probation, and inventing one for a single form would put a rule in the engine that
-- only ever applies to this. Completed Evidence and the two dates stay visible for ever; only
-- the way in closes.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  v_desc text := $d$A check on a new member of staff at week 4 and week 8 of probation: that the availability on file is still right, how the balance of their work and their life is, and what went well and badly for them. It is NOT a probation meeting. It exists to find what the company can do better as much as what the employee can.$d$;
  v_schema jsonb := $j$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "check",
      "title": "The check",
      "fields": [
        {
          "key": "week",
          "type": "single_select",
          "label": "Week check completed",
          "required": true,
          "options": [
            {
              "value": "4",
              "label": "Week 4"
            },
            {
              "value": "8",
              "label": "Week 8"
            }
          ],
          "help": "Which of the two probation health checks this is."
        },
        {
          "key": "date_of_conversation",
          "type": "date",
          "label": "Date of conversation",
          "required": true,
          "completionDate": true,
          "help": "The day the conversation happened."
        }
      ]
    },
    {
      "id": "availability",
      "title": "Availability and balance",
      "fields": [
        {
          "key": "availability",
          "type": "long_text",
          "label": "Their current availability, in their own words",
          "required": true,
          "validation": {
            "maxLength": 2000
          },
          "help": "If it has changed, update the system, tell the planner, and say that any further change needs a month's notice to take effect."
        },
        {
          "key": "work_life_balance",
          "type": "single_select",
          "label": "Are they happy with their current work life balance?",
          "required": true,
          "options": [
            {
              "value": "yes",
              "label": "Yes"
            },
            {
              "value": "no",
              "label": "No"
            }
          ]
        },
        {
          "key": "work_life_detail",
          "type": "long_text",
          "label": "What is not working, and what would help",
          "required": true,
          "validation": {
            "maxLength": 2000
          },
          "visibleWhen": {
            "field": "work_life_balance",
            "in": [
              "no"
            ]
          }
        }
      ]
    },
    {
      "id": "feedback",
      "title": "Feedback",
      "description": "Open questions. The answers are the point of the check: they say what to change, for this person and for the company.",
      "fields": [
        {
          "key": "went_well",
          "type": "long_text",
          "label": "What went well for you in the last few weeks?",
          "required": true,
          "validation": {
            "maxLength": 2000
          }
        },
        {
          "key": "company_better",
          "type": "long_text",
          "label": "What could we as a company have done better for you?",
          "required": true,
          "validation": {
            "maxLength": 2000
          }
        },
        {
          "key": "own_improvement",
          "type": "long_text",
          "label": "One area you feel you may need to improve",
          "validation": {
            "maxLength": 2000
          },
          "help": "Optional."
        },
        {
          "key": "company_improvement",
          "type": "long_text",
          "label": "One area the company could improve, or any suggestion overall",
          "validation": {
            "maxLength": 2000
          },
          "help": "Optional."
        },
        {
          "key": "training_needed",
          "type": "long_text",
          "label": "Would you benefit from further training? If so, what?",
          "validation": {
            "maxLength": 2000
          },
          "help": "Optional."
        }
      ]
    },
    {
      "id": "sign_off",
      "title": "Sign off",
      "fields": [
        {
          "key": "conductor_signature",
          "type": "signature",
          "label": "Declaration",
          "required": true,
          "help": "I confirm this is an accurate record of the conversation."
        }
      ]
    }
  ]
}
$j$::jsonb;
  c record;
  v_form uuid;
  v_def uuid;
  v_sort int;
begin
  for c in select id from public.companies where deleted_at is null loop
    select id into v_form from public.forms where company_id = c.id and key = 'health_check';

    if v_form is null then
      insert into public.forms (company_id, key, name, population, description, status, current_version)
      values (c.id, 'health_check', 'Health Check', 'people', v_desc, 'active', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    else
      update public.forms set name = 'Health Check', description = v_desc, status = 'active'
       where id = v_form;
      update public.form_versions set schema = v_schema
       where form_id = v_form and version = (select current_version from public.forms where id = v_form);
    end if;

    select id into v_def from public.check_definitions
     where company_id = c.id and population = 'people' and key = 'health_check';

    if v_def is null then
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_definitions where company_id = c.id and population = 'people';
      insert into public.check_definitions
        (company_id, population, key, name, description, form_id, recurring, frequency, "interval",
         anchor, active, sort_order, schedule_mode, show_on_register)
      values
        (c.id, 'people', 'health_check', 'Health Check',
         'A check on a new starter at week 4 and week 8 of probation.',
         v_form, false, null, null, 'completion', true, v_sort, 'ad_hoc', false)
      returning id into v_def;
    else
      update public.check_definitions set form_id = v_form, active = true where id = v_def;
    end if;

    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, person_id, due_date)
    select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
    from public.people pe
    where pe.company_id = c.id and pe.employment_status = 'active' and pe.archived_at is null
    on conflict (definition_id, person_id) do nothing;

    v_form := null;
    v_def := null;
  end loop;
end
$mig$;
