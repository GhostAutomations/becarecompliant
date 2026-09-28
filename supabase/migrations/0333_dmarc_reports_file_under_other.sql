-- 0333: DMARC aggregate reports already in the founder inbox move to Other.
-- Phil, 2026-09-28: the daily DMARC reports from Google, Microsoft and Yahoo should file under
-- Other, not the Inbox. New ones are caught by isDmarcReport in lib/founder/inbox.ts when they
-- arrive; this moves the ones received before that. Same rule as the code: "dmarc" in the sender
-- address, or the standard "Report Domain: ... Submitter: ..." subject. Safe to run twice.
update public.founder_emails
   set is_spam = true
 where direction = 'in'
   and is_spam = false
   and (
     lower(from_address) like '%dmarc%'
     or subject ~* '^\s*(\[preview\]\s*)?report domain:.*submitter:'
   );
