-- Be Care Compliant: the demo seed speaks the v2 review (Phil, 2026-10-05: "all companies and
-- demos"). Two small edits, made to the live function text so nothing else in them moves:
--
--   * seed_demo_company: the one review in sixteen that is not wholly positive used to answer
--     "call times do not suit", which is no longer scored. It now records an unresolved issue,
--     so the demo's satisfaction stays high but believable on the new questions.
--   * demo_sample_answers: the Outcomes section (outcomes_review) gets an answer, so demo
--     history reads "No other outcomes they would like to achieve" instead of Not answered.

do $$
declare d text;
begin
  d := pg_get_functiondef('public.seed_demo_company'::regproc);
  if position('call_times_suit' in d) > 0 then
    d := replace(d,
      $o$jsonb_build_object('call_times_suit', 'No',
               'times_not_suiting', 'The morning call is earlier than they would like.',
               'times_that_suit', 'After 8.30 in the morning.')$o$,
      $n$jsonb_build_object('sat_unresolved_issues', 'Yes',
               'sat_unresolved_issues_detail', 'The morning call is earlier than they would like. Agreed to look at the rota.')$n$);
    if position('call_times_suit' in d) > 0 then
      raise exception 'seed_demo_company did not contain the expected text; nothing changed';
    end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.demo_sample_answers'::regproc);
  if position('outcomes_review' in d) = 0 then
    d := replace(d,
      $o$    elsif t = 'number' then$o$,
      $n$    elsif t = 'outcomes_review' then
      v := v || jsonb_build_object(k, jsonb_build_object('current', '[]'::jsonb, 'add', 'No',
             'newTitle', '', 'newSupport', '', 'newTarget', ''));
    elsif t = 'number' then$n$);
    if position('outcomes_review' in d) = 0 then
      raise exception 'demo_sample_answers did not contain the expected text; nothing changed';
    end if;
    execute d;
  end if;
end $$;
