# Complaints final testing

> Complaints batch verified live in Chrome 2026-07-16; one behavioural test logged to Final Testing

Tested live in Chrome (Thistle, via Manage-as-company) on 2026-07-16, all PASS:
Open/Closed sub-departments split, headings "Complaints: Open"/"Complaints: Closed", formal-gating (non-formal shows only Initial Response), investigation form Branch autofill (Newport1), initial-response bullet prefill, sign-off Name autofill, official-outcome question removed, new "Outcome of the investigation" field, log-a-complaint service users filtered by branch (Cardiff1 vs Newport1 complementary), Update status button flashes (no stuck green), AI Complaint Response signs off with the investigation Name ("Test Manager") not the branch.

**Logged to Final Testing (not yet behaviourally tested):** the AI complaint-response CONFIDENTIALITY guardrail (must withhold internal staff/HR/disciplinary actions e.g. "dismissed the carer"). Couldn't verify live because the existing investigation had no HR/dismissal content. Repro: on a formal complaint, complete a Complaint Investigation whose "Outcome of the investigation" states a staff disciplinary/dismissal, generate Complaint Response, confirm the draft does NOT disclose it (should say appropriate action taken, without specifics). Guardrail is in the prompt in lib/complaints/actions.ts generateComplaintResponse. See [public-forms](public-forms.md), [phase4-built](phase4-built.md).

Also not individually clicked: ~10 of the 12 bespoke save buttons switched to the shared `useSavedFlash` hook (edit-person + branch + Update status verified; pattern shared, low risk). See [save-button-behaviour](save-button-behaviour.md).
