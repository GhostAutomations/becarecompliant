-- Care Plan document on a service user: uploaded at add time or later on the setup
-- form. The file lives in the private 'evidence' bucket under a care-plans/ prefix
-- (served only via short-lived signed URLs); these columns hold the pointer.
alter table public.service_users add column if not exists care_plan_path text;
alter table public.service_users add column if not exists care_plan_uploaded_at timestamptz;
