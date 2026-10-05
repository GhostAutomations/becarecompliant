# Test checklist: after Save, a form shows what was saved (2026-10-05)

Phil: a Supervisor at Thistle set Jon Ibrahim's Service status to Hospital and pressed Save; the save worked (Compliance showed Hospital) but the box on Manage record jumped back to Active, so she did it several times. Cause: the shared ActionForm called form.reset() after every successful save, which puts each field back to the value the page FIRST drew (the old value on an edit form). Fix: the fields are redrawn from the page as it stands after the save. Applies to all ~100 ActionForm forms.

| # | Check (as Bev, Bevan) | Result |
|---|-------|--------|
| S1 | ZZ TEST Service User Two, Manage record: Service status Active to Hospital, Save: the box shows Hospital and stays Hospital; the header pill says Hospital | NOT TESTED |
| S2 | Set it back to Active, Save: shows Active | NOT TESTED |
| S3 | An "add" form built on ActionForm still comes back empty after a successful save | NOT TESTED |
| S4 | A refused save still keeps what was typed (standing rule, 2026-10-01) | NOT TESTED |
