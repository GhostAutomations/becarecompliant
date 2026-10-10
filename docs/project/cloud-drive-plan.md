# Cloud drive copies (OneDrive / SharePoint first, Google Drive second): plan

Asked for by Thistle and a future client (Phil, 2026-10-08). Agreed:
- Plan now, build next in the current phase. Using Microsoft Graph and the Google Drive API is approved.
- OneDrive / SharePoint first, then Google Drive on the same design.
- A company connects it with a Connect button in Settings. An Admin signs in to Microsoft on their own screen and approves access. We never see or store their password.
- From now on, plus a "Copy everything so far" button that fills the folders in the background.
- **Where it lives:** the company chooses on the Connect screen, a SharePoint site or the Admin's own OneDrive. SharePoint is shown as the suggested choice.
- **Folder names:** name and branch, e.g. "Jane Smith (Cardiff)". Renamed when they change branch or their name changes. Leavers and discharged service users keep their folder; nothing is ever deleted from the drive by BCC.
- **Plans:** every plan, Business to Black.
- **Briefings:** memos, messages and attachments are copied once into a Briefings folder; signed ones also go in the person's folder.

## What the company gets

In their own Microsoft 365 a folder called **Be Care Compliant**, with:

```
Be Care Compliant/
  People/
    Jane Smith (Cardiff)/          one folder per person
      2026-10-08 Supervision 1 (v3).pdf
      2026-09-14 Moving and handling certificate.pdf
  Service Users/
    Joe Bloggs (Newport)/
      2026-10-01 Care plan review (v2).pdf
  Complaints/
    C-2026-014 Joe Bloggs.pdf
  Incidents/
  Policies/
    Medication policy v4.pdf
  Briefings/
    2026-10-08 Cardiff Meeting Minutes (memo).pdf
```

Every time something is completed or uploaded in BCC, a copy of the same PDF or file lands in the right folder. BCC stays the record. The drive gets a copy.

## How it works (plain English)

1. **Connect.** Settings, Cloud drive, "Connect Microsoft 365". The Admin signs in and approves, then chooses a SharePoint site (suggested, because it belongs to the company, not one person) or their own OneDrive. We store an access key from Microsoft, encrypted and server side only. They can disconnect at any time.
2. **Folders.** The top folder and the section folders are made straight away. A person's or service user's folder is made when they are added to a register, or the first time something is copied for them.
3. **Copies.** Each event (Evidence filed, certificate uploaded, policy approved, complaint or incident updated, absence letter sent, briefing sent or signed) puts a job in a queue. A background worker uploads it within a minute or two and retries if Microsoft is slow or down. The same document is never uploaded twice.
4. **Visible state.** Settings shows Connected, the last copy made, how many are waiting and any failures, with Retry. If the connection stops working (the Admin who connected leaves, their password changes, or access is removed), the card turns red, the Admins get an email, and nothing is lost: copies wait in the queue until it is reconnected.
5. **Copy everything so far.** A button that queues the full history, using the same collector as the subject access request export, and works through it in the background with progress shown.

## What gets copied (first version)

| BCC | Drive folder |
|---|---|
| Evidence (every completed form, incl. paper uploads, RTW, absence meetings, supervisions, care reviews) | Person or service user folder |
| Training certificates | Person folder |
| DBS, Right to Work documents | Person folder |
| Signed policies and signed briefings | Person folder |
| Absence invitation and outcome letters | Person folder |
| Policies (approved PDF, each version) | Policies |
| Complaints (summary PDF when logged, updated and closed) | Complaints |
| Incidents (summary PDF) | Incidents |
| Memos, messages and their files | Briefings |

## Building blocks

- `cloud_connections`: company, provider, account, where the folder lives (site or OneDrive), encrypted refresh token, status, last error, connected by and when.
- `cloud_folders`: which drive folder belongs to which person, service user or section, so a folder is never made twice and renames can follow.
- `cloud_sync_queue`: one row per document to copy, with a unique key (so it is safe to run twice), attempts, next try and last error. Worked by a Vercel cron every few minutes, plus an immediate try right after the event.
- One shared helper (`queueCloudCopy`) that every event calls, so no feature talks to Microsoft directly.
- Env vars: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `CLOUD_TOKEN_KEY` (encryption key). Set up with a step by step walkthrough of registering the app in Microsoft Entra.

## GDPR and security

- The company is the controller; the copy in their drive is theirs to look after. BCC's retention, anonymisation and deletion **do not reach** copies already in their drive. The Connect screen says so plainly, and the DPA and subscription agreement get a clause.
- Least access asked of Microsoft, tokens encrypted at rest, never sent to the browser, every connect, disconnect and copy audit logged.
- Service user data is special category health data, so the Connect screen suggests a SharePoint site with restricted membership rather than someone's personal OneDrive.

## Still open

- Google Drive timing once OneDrive is live.
- A test Microsoft 365 for Bevan (or use Thistle's with a test site).

## Build order

1. Database tables, token encryption, the queue and the shared helper.
2. Microsoft connect, disconnect and the Settings card (with the Entra walkthrough).
3. Folder making, then Evidence copies, then certificates and documents.
4. Policies, complaints, incidents, letters, briefings.
5. Copy everything so far.
6. Test on Bevan with a test Microsoft 365, then Thistle.
7. Google Drive on the same design.

Sources: Google Drive API scopes (drive.file is non sensitive; full drive access is restricted and needs a security assessment): https://developers.google.com/workspace/drive/api/guides/api-specific-auth . Microsoft Graph SharePoint permissions and admin consent: https://docs.connectmyapps.com/docs/app-guides/sharepoint/sharepoint-graph-permissions-guide
