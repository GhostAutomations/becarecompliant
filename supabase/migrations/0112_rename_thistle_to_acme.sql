-- 0112: Rename the test/demo company "Thistle Care Wales" to "Acme Care Company"
-- and scrub every "Thistle Care" / "TCW" reference from its data, so the real
-- "Thistle Care" name is free for a genuine future tenant.
--
-- Scope agreed with Phil (2026-07-23):
--   * Going-forward: company name, office/branch name, slug (tcw->acc),
--     complaint reference prefix (TCW->ACC).
--   * Founder template library labels that hard-coded "Thistle Care" -> "Acme Care Company".
--   * Historical/immutable records rewritten too for a clean slate (this is a
--     test tenant): evidence, form versions, audit log, notification log,
--     complaint letters.
--   * Deliberately NOT changed: absence_config.policy_path. It points at an
--     uploaded PDF whose object name contains "Thistle"; renaming the pointer
--     would 404 the file. Re-upload that policy to clean the filename.
-- Applied live via the Supabase MCP; this file keeps the repo as source of truth.

create or replace function pg_temp.bcc_swap(t text) returns text language sql immutable as $$
  select case when t is null then null else
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      t
      ,'Thistle Care Wales Office','Acme Care Company Office')
      ,'Thistle Care Wales','Acme Care Company')
      ,'Thistle Care''s','Acme Care Company''s')
      ,'Thistle Care’s','Acme Care Company''s')
      ,'Thistle Cares','Acme Care Company''s')
      ,'Thistle Care Ltd.','Acme Care Company Ltd.')
      ,'Thistle_Care','Acme_Care_Company')
      ,'Thistle Care','Acme Care Company')
      ,'Thistle','Acme')
      ,'thistle','acme')
      ,'TCW','ACC')
      ,'tcw','acc')
  end
$$;

update companies set name=pg_temp.bcc_swap(name), slug=pg_temp.bcc_swap(slug)
  where id='9d7d082b-89d8-44f6-83b8-71b5155c7d51';
update branches set name=pg_temp.bcc_swap(name) where name ilike '%thistle%';
update complaints_config set ref_prefix=pg_temp.bcc_swap(ref_prefix) where ref_prefix ilike '%tcw%' or ref_prefix ilike '%thistle%';
update absence_config set policy_ai_summary=pg_temp.bcc_swap(policy_ai_summary) where policy_ai_summary ilike '%thistle%';
update form_templates set key=pg_temp.bcc_swap(key) where key ilike '%thistle%' or key ilike '%tcw%';
update form_templates set schema=pg_temp.bcc_swap(schema::text)::jsonb where schema::text ilike '%thistle%';
update forms set key=pg_temp.bcc_swap(key), source_template_key=pg_temp.bcc_swap(source_template_key)
  where key ilike '%thistle%' or source_template_key ilike '%thistle%';
update form_versions set schema=pg_temp.bcc_swap(schema::text)::jsonb where schema::text ilike '%thistle%';
update evidence set schema_snapshot=pg_temp.bcc_swap(schema_snapshot::text)::jsonb where schema_snapshot::text ilike '%thistle%';
update evidence set answers=pg_temp.bcc_swap(answers::text)::jsonb where answers::text ilike '%thistle%';
update audit_log set summary=pg_temp.bcc_swap(summary) where summary ilike '%thistle%' or summary ilike '%tcw%';
update audit_log set metadata=pg_temp.bcc_swap(metadata::text)::jsonb where metadata::text ilike '%thistle%' or metadata::text ilike '%tcw%';
update notification_log set dedupe_key=pg_temp.bcc_swap(dedupe_key), to_address=pg_temp.bcc_swap(to_address)
  where dedupe_key ilike '%tcw%' or dedupe_key ilike '%thistle%' or to_address ilike '%tcw%' or to_address ilike '%thistle%';
update complaint_responses set subject=pg_temp.bcc_swap(subject), body=pg_temp.bcc_swap(body)
  where subject ilike '%thistle%' or subject ilike '%tcw%' or body ilike '%thistle%' or body ilike '%tcw%';
