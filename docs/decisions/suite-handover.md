# Suite handover

> The JCN → Carer.Academy → BCC pipeline (Phil, 2026-08-14), part of Phase 14 / Operation New Dawn. Seven design decisions SETTLED, including why records are addressed by an opaque reference and never matched on company name or email. BCC RECEIVES ONLY, never pushes. Read before designing any cross-product integration.

**Phil, 2026-08-14.** The three products stop being a suite story and become one pipeline. A
carer is recruited on **Join Care Now**, trained by **Carer.Academy**, and arrives in **Be Care
Compliant** already compliant, with the evidence attached.

## The flow

1. A carer applies on **JCN**.
2. In the recruitment pipeline they are moved to the **Training** stage.
3. That move calls **Carer.Academy** over a webhook or API, which creates their account.
4. C.A issues the training.
5. On completion **C.A tells JCN**, and the candidate carries on down the pipeline.
6. When moved to **Hired**, their details **and their training record** go to **BCC**.
7. **After hire, C.A sends further completed training straight to BCC** — JCN is out of the loop.

## BCC builds the RECEIVING END, and only that

JCN and C.A push; BCC accepts. The standing rule that nothing in the becarecompliant repo touches
the **joincarenow** or **carer-academy** projects still holds — separate Supabase projects,
separate repos, separate sessions.

**BCC pushes nothing anywhere, and receives from TWO senders**: JCN at the moment of hire, and
Carer.Academy for training after it. Two inbound routes, one direction of travel. (Decisions 4
and 5 look contradictory at a glance and are not.)

## The seven decisions, settled 2026-08-14

1. **Which tenant: an API key per BCC company.** JCN stores the key against that employer, so the
   KEY IS THE COMPANY. No name or domain matching, so a rename on either side changes nothing.
   The branch is named separately in the payload.
2. **Hired sends the Team Member invite immediately**, so a carer can sign policies before their
   first shift rather than after it.
3. **A carer who already exists is FLAGGED, never merged automatically.** A manager sees the
   incoming record beside the existing one and chooses what to take across. Same shape as the
   unmatched submissions queue. **Nothing a manager typed is ever overwritten by a machine.**
4. **Nothing is pushed back to JCN.** One way.
5. **Training completed after hire comes from C.A DIRECTLY to BCC.**
6. **The carer is told at the point they apply** — it goes into the JCN privacy notice. Three
   companies, three controllers, so the lawful basis is established before the first real carer.
7. **A record is addressed by an OPAQUE REFERENCE; email and phone are a CHECK, never the
   address.** At hire BCC issues a reference for that person which reaches C.A, and every
   completion carries it. Email and phone travel alongside and **BCC refuses and flags when they
   do not match the record the reference points at** — catching a mis-issued reference, a
   replaced leaver, a wrong-person mix-up. Company name is never matched on: display only. A
   completion with NO reference goes to the flag queue by decision 3. Costs C.A one stored field
   per learner.

### Why not match on company name + email + phone (Phil asked, 2026-08-14)

Keep these; they will come up again.

- **A carer works for two agencies.** Normal in domiciliary care — bank staff, top-up shifts. The
  same email then exists in two BCC companies, and a completion addressed only by email says
  nothing about whose register it belongs in. Guessing files training into the wrong company's
  compliance evidence.
- **A company name drifts, and already has.** Acme was "Thistle Care Wales" until July and the
  Stripe customer still said so a month later — the defect fixed 13 August. Decision 1 chose an
  API key precisely to avoid name matching.
- **A cross-system email lookup is a probe.** If BCC searches every company for an inbound email,
  anyone who can reach the endpoint can discover whether a given person works for a given care
  company. With a reference, no search happens.

## What the endpoints still have to get right

- **Authentication that fails closed**, in the shape the Stripe and Twilio webhooks already use:
  signed request, PUBLIC_PATHS entry, 4xx rather than a silent 200 on a bad signature.
- **Idempotency.** The same carer WILL arrive twice — a retry, a re-hire, somebody pressing Hired
  again. Needs an external id from JCN; with decision 3 a duplicate goes to the flag queue.
- **Course mapping.** C.A's course names are not BCC's. Reuse the training CSV import logic
  ([training-import](training-import.md)), where six data-destroying defects were caught in review. Do not
  write a second matcher.

## Still open

- **A branch in the payload that matches nothing in BCC**: reject the carer, or file to the
  office row and flag it.

## Why it matters commercially

Very few vendors, and none at small-provider prices, own recruit → train → keep compliant end to
end. It is also the strongest switching argument BCC has: a competitor can copy a register, but
not the pipeline that fills it.

Related: [operations](operations.md) [freedom](freedom.md) [training-import](training-import.md) [staff-logins](staff-logins.md)
[project-state](project-state.md)
