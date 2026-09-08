-- 0252_a_team_member_can_record_a_financial_transaction
-- Thistle's form for money handled on a Service User's behalf. On monday it is called
-- "New Board" -- the default name it was created with and never renamed -- which tells you
-- how much attention the money form gets when it lives in a form builder.
--
-- THE ONE FORM A TEAM MEMBER FILLS IN THEMSELVES (Phil's standing rule). Everything else in
-- the product is a manager writing about somebody. This is the person who actually held the
-- money writing it down, at the door, with the Service User signing next to them. Typed up
-- by an office three days later it is a note ABOUT a transaction; recorded there and then it
-- IS the transaction. It lives in My area alongside Raise a concern, for the same reason.
--
-- NO CHECK BEHIND IT. Shopping happens when it happens, so there is nothing for this to be
-- late for: no due date, no RAG, no column on the matrix. It files Evidence against the
-- carer's own record, which is where a question about somebody's money gets answered from.
--
-- A RECEIPT, OR WHY THERE ISN'T ONE (Phil, 2026-09-08). The paper form has the receipt
-- upload as optional, and money handled with no receipt and no explanation is the thing that
-- goes wrong. "Do you have a receipt?" now decides: Yes asks for the photograph and requires
-- it, No asks why and requires that. Either answer is fine. Silence is not, and a carer
-- standing in a corner shop that gave them nothing can still record the transaction -- which
-- is exactly the case a required-upload would have blocked, leaving no record at all.
--
-- DROPPED as givens: Service User Name is now picked from the register with the same
-- type-ahead the Spot Check uses, so it links to a real record rather than being typed; and
-- Carer Name goes, because the Evidence stamps who submitted it and it is filed on their own
-- record. The declaration above the signature is kept word for word.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "transaction", "title": "The transaction", "description": "Fill this in with the person, before you leave. It is their money and their record of it.", "fields": [{"key": "service_user", "type": "record_lookup", "lookup": "service_user", "label": "Service User", "required": true, "help": "Whose money this was."}, {"key": "transaction_date", "type": "date", "label": "Date", "required": true}, {"key": "purpose", "type": "short_text", "label": "What was the money for?", "required": true, "validation": {"maxLength": 200}, "help": "For example shopping, a prescription, a gas top up."}, {"key": "amount_taken", "type": "number", "label": "Amount taken (\u00a3)", "required": true, "validation": {"min": 0}, "help": "How much you were given."}, {"key": "change_returned", "type": "number", "label": "Change returned to the Service User (\u00a3)", "required": true, "validation": {"min": 0}, "help": "How much you handed back. Enter 0 if there was none."}]}, {"id": "receipt", "title": "The receipt", "fields": [{"key": "receipt_available", "type": "single_select", "label": "Do you have a receipt?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"key": "receipt", "type": "file_upload", "label": "Photograph or scan of the receipt", "required": true, "visibleWhen": {"field": "receipt_available", "in": ["yes"]}, "help": "A photograph of it is fine."}, {"key": "no_receipt_reason", "type": "long_text", "label": "Why is there no receipt?", "required": true, "validation": {"maxLength": 1000}, "visibleWhen": {"field": "receipt_available", "in": ["no"]}, "help": "For example none was given, the machine was broken, or it was lost. Say what happened - it is worth as much as the receipt if anybody asks later."}]}, {"id": "sign_off", "title": "Signed by the Service User", "fields": [{"key": "comments", "type": "long_text", "label": "Comments", "validation": {"maxLength": 2000}, "help": "Anything else worth recording. Optional."}, {"key": "service_user_signature", "type": "signature", "label": "Service User signature", "required": true, "help": "I confirm that the information above is accurate, and that any money taken and change given has been recorded correctly."}]}]}'::jsonb;
  v_desc text := 'A record of money handled on a Service User''s behalf: what was taken, what it was for, the receipt, and the change given back. Completed by the Team Member with the Service User signing.';
  v_company record;
  v_form uuid;
  v_blocked int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'financial_transaction';

  if v_blocked > 0 then
    raise exception 'Financial Transaction has % pieces of evidence against it; delete the test evidence or publish a new version', v_blocked;
  end if;

  insert into public.form_templates (key, name, population, description, schema, status)
  values ('financial_transaction', 'Financial Transaction', 'people', v_desc, v_schema, 'active')
  on conflict (key) do update
     set name = excluded.name, population = excluded.population,
         description = excluded.description, schema = excluded.schema,
         status = 'active', updated_at = now();

  for v_company in select id from public.companies where deleted_at is null loop
    insert into public.forms (company_id, key, name, population, description, source_template_key, status, current_version)
    values (v_company.id, 'financial_transaction', 'Financial Transaction', 'people', v_desc, 'financial_transaction', 'active', 1)
    on conflict (company_id, key) do nothing
    returning id into v_form;
    if v_form is null then
      select id into v_form from public.forms where company_id = v_company.id and key = 'financial_transaction';
      update public.form_versions set schema = v_schema where form_id = v_form and version = 1;
    else
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;
    v_form := null;
  end loop;
end
$mig$;
