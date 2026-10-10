# New dawn features

> Phil's own New Dawn (Phase 14) feature list, in his words, as he gives it, plus the decisions on each. Read before planning or building New Dawn features.

## Feature list (Phil, from 2026-09-26)
- [stated] Care setup (new service user setup) is recorded, audio only; the supervisor uploads the recording, AI completes the setup in BCC, the supervisor checks and approves it
- [stated] Medication at setup: supervisor photographs the medicine boxes showing the pharmacy label; AI creates the MAR chart; supervisor enters the times or assigns the medicines to the calls they are given at, checks and approves

## Decisions (popup 2026-09-26)
- [stated] Setup audio is deleted once the supervisor approves the setup
- [stated] Consent step in the app before recording can start (service user, or representative if they lack capacity, and who agreed); if refused, setup is filled in by hand
- [stated] AI-drafted MAR: supervisor checks every medicine against the labels and approves, then a second trained person confirms before it goes live

## Open
- Claude API does not accept audio, so a speech-to-text supplier is needed: a new subprocessor, needs Phil's approval and a DPA annex update
- NICE NG67 MAR must include date of birth and GP practice; BCC service user records don't hold DOB yet

Related: [freedom](freedom.md) [thistle-systems](thistle-systems.md)
