-- 0124: The Type field alone decides whether a case is formal (app rule change,
-- lib/complaints/logic.ts isFormalComplaint). Previously only concern_type
-- 'Complaint' + formality 'Formal' earned a response deadline, so open cases in
-- other categories marked Formal (e.g. Minor Complaint) have no response_due.
-- Backfill it from each company's complaints timescales (defaults: 25 calendar
-- days, matching DEFAULT_COMPLAINTS_CONFIG).
do $$
declare
  r record;
  cfg record;
  days int;
  working boolean;
  d date;
  added int;
begin
  for r in
    select c.id, c.company_id, c.date_raised
    from complaints c
    where c.formality = 'Formal'
      and c.response_due is null
      and c.status <> 'closed'
      and c.date_raised is not null
  loop
    select response_days, count_working_days into cfg
      from complaints_config where company_id = r.company_id;
    days := coalesce(cfg.response_days, 25);
    working := coalesce(cfg.count_working_days, false);
    if working then
      d := r.date_raised; added := 0;
      while added < days loop
        d := d + 1;
        if extract(isodow from d) < 6 then added := added + 1; end if;
      end loop;
    else
      d := r.date_raised + days;
    end if;
    update complaints set response_due = d where id = r.id;
  end loop;
end $$;
