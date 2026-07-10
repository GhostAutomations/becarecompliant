# TEST CHECKLIST — Phase 5 (Form builder)

Run as popups, one check at a time (Pass / Fail / Not tested). Anything Not tested is
logged into Final Testing. Do NOT start until the push is deployed (Vercel build green)
and migrations 0038 + 0039 are applied (both confirmed applied to ref bgrtcvyjuwopunpnudeu).

Test as: a Company Admin in Thistle Care Wales (forms authoring) and the Founder (template
library). Vocabulary check throughout: only Form / Evidence / Check / Record / Register,
never "item" or "board"; no dashes in any customer-facing copy.

## A. Forms list and creation

1. Settings shows a Forms tile; it opens /settings/forms with a Back link and the seeded
   forms grouped into People forms and Service User forms.
2. Empty state: a company with no forms shows the zero state (not an error).
3. New form, blank: create a blank People form; it opens the builder with one empty section
   and a Draft badge; the list shows it as Not published + Draft.
4. New form, duplicate: create a form by duplicating an existing one; the new form opens
   pre-filled with the source form's fields, under a new name.
5. Population filter on duplicate: the "Start from" list only offers forms of the chosen
   population.

## B. Builder — sections and fields

6. Add / remove / reorder sections; section title and description save into the draft.
7. Add each field type once (short text, long text, number, date, dropdown, multi select,
   radio, checkbox, section heading, signature, file upload) and reorder fields up/down.
8. Per-field config: label, key, required, help text, placeholder all persist.
9. Options editor: add/remove options on dropdown/radio/multi select; empty or duplicate
   option values are flagged as errors.
10. Validation: number min/max and text min/max length + pattern persist; min > max is
    flagged; an invalid regex is flagged.
11. Conditional logic: set "show only when" referencing an earlier choice field; the picker
    lists valid source fields and their values.
12. Validation summary blocks Publish while any error is present (duplicate key, empty label,
    choice field with fewer than two options, bad key format).

## C. Live preview (shared renderer)

13. Preview tab mounts the real FormRenderer; every field type renders via the canonical
    controls (dark glass, gold focus), on desktop and mobile.
14. Conditional show/hide works live in preview as options change.
15. Required markers and inline validation appear exactly as a completer would see them.

## D. Draft → publish → versioning (immutability)

16. Save draft: edits persist after a refresh; the Unsaved changes indicator clears on save.
17. Publish: the draft becomes the current version; the list shows the new version number and
    the Draft badge clears.
18. Edit a published form: "Edit form" creates a NEW draft (higher version) cloned from the
    published schema; the published version is unchanged.
19. Immutability: attempting to edit a published version is rejected server-side (the builder
    only ever writes the draft). Confirm past Evidence still renders with its original schema
    (complete a form, publish a changed version, reopen the earlier Evidence).
20. One draft per form: you cannot create a second parallel draft; re-entering edit returns
    the same draft.
21. Discard draft: removes the draft and returns to the list; a never-published form that is
    discarded is removed entirely.
22. Version history panel lists versions with status, author and date, marking the current one.

## E. Compliance loop with a built form

23. Build + publish a new People form, then in Settings > People > New check type, create a
    check tied to it (interval + period + amber). It is added to every active Record now
    (blank due) and to new Records; leavers/archived excluded.
24. Complete that new check for a Record: it produces immutable Evidence, stamps completion,
    and sets the next due date from the interval (the full Phase 3 loop, on an authored form).
25. Same for Service Users: build + publish a Service User form, create a Service User check
    type tied to it, confirm it lands on active service users (cancelled excluded) and the
    loop advances the due date.
26. New check type guard: the form picker only offers PUBLISHED forms of the matching
    population; a draft-only form cannot be attached.

## F. Founder template library

27. Founder console shows a Form template library tile; /founder/forms lists the master
    templates grouped by population with version and status.
28. New template: create one (key, name, population); it opens the same builder in template
    mode (Save template, no draft/publish split).
29. Edit + save a template bumps its version; a company that already seeded its copy is
    unaffected (seed a new company after editing and confirm it gets the new schema; the old
    company keeps its copy).
30. Archive / restore a template; archived templates are not seeded into a newly created
    company.
31. A Company Admin cannot reach /founder/forms (redirected); RLS blocks form_templates writes
    for non platform admins.

## G. New field types (engine reopened, Phase 2)

32. Build a form using each new type: Time, Email, Phone, Address, Yes or No, Rating.
    Each renders via the canonical dark controls in the builder preview and on the real
    completion screen.
33. Validation: Email rejects a bad address; Phone rejects letters; Time requires HH:MM;
    Rating enforces 1 to max; a required Address requires at least line 1 and postcode.
34. Rating: the Maximum stars setting changes the number of stars; the chosen value shows
    as "N of M".
35. Address: the parts (line 1, line 2, town, county, postcode) save together and display
    as one comma separated line in the record and evidence.
36. Complete a check whose form uses the new types: immutable Evidence stores the answers,
    and the branded evidence PDF renders every new type correctly (rating as "N of M",
    address on one line, Yes/No, time, email, phone).
37. Conditional logic on a Yes or No trigger: a follow up field shows only when Yes (or No)
    is chosen, live in preview and on completion.

## H. Builder ergonomics

38. Drag a field by its handle to reorder within a section; the up/down arrows still work
    as a fallback. Typing in a field's inputs never starts a drag.
39. Insert a field at any position using the + Insert point between fields, not only at the
    end of the section.
40. Drag a section by its handle to reorder sections.
41. Content outline (left column) lists every section and field; clicking one scrolls the
    editor to it. Collapses on a narrow screen.

## I. Question bank

42. Founder console shows a Question bank tile; /founder/question-bank lists entries and lets
    you create one (label, type, scope People / Service Users / Any, category, options).
43. In the builder, the add-field menu shows a From question bank tab (only when the bank has
    entries for that population or Any); picking one inserts a field pre-filled from the bank.
44. Bank scoping: a People-only question does not appear when editing a Service User form, and
    vice versa; Any appears on both.
45. Archive a bank question; it stops appearing in the builder add menu but existing forms that
    already used it are unchanged.
46. A Company Admin cannot reach /founder/question-bank (redirected); RLS blocks question bank
    writes for non platform admins (reads are allowed so the builder can offer them).

## Log to Final Testing if Not tested / needs extra tenants or roles

- Cross-tenant RLS: a Company Admin of company A cannot read or edit company B's forms /
  form_versions; form_templates readable/writable by the Founder only. Needs two tenants.
- Manager / Supervisor / Team Member cannot author forms (no Forms tile write path; RLS
  blocks forms/form_versions insert-update). Needs those roles.
- Evidence rendered from a pinned older version after the form is republished (item 19),
  end to end via the download/export path (Phase 8 on-demand PDF).
- Engine reopened for the new field types (schema, validator, formatter, renderer, evidence
  PDF): full cross-browser + mobile render of Time, Email, Phone, Address, Yes or No, Rating,
  and the evidence PDF for each, since Phase 2 was previously signed off on the smaller set.
- Question bank RLS: any authenticated member can read the bank but only the Founder can
  write it (needs a non-founder session to confirm the read-only exposure is acceptable).
