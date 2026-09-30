/**
 * The customer contract, as the app shows it and as a Company Admin accepts it (Phase 13,
 * Phil approved version 1.0 on 2026-09-29). THE ONE SOURCE: the public pages, the accept
 * screen and the fingerprint stored with every acceptance all read these two strings.
 *
 * {{tokens}} are filled from lib/legal/supplier.ts. Changing a word here is a new version:
 * bump LEGAL_VERSIONS in lib/legal/documents.ts, keep the old text beside it, and every
 * Company Admin is asked to accept again (clause 19).
 *
 * Pure and importless so node --test can read it. No dashes in customer copy.
 */

export const SUBSCRIPTION_AGREEMENT_1_0 = `# Be Care Compliant Subscription Agreement

**{{version_line}}**

This agreement is between:

**{{supplier_name}}**, a company registered in England and Wales under number {{supplier_number}}, whose registered office is at {{supplier_address}}, trading as **Be Care Compliant** ("**we**", "**us**", "**our**"); and

**the customer named in the Order** ("**you**", "**your**").

It applies from the moment your Company Admin accepts it in the platform, or signs an Order that refers to it, whichever happens first.

## 1. How this agreement fits together

1.1 The contract between us is made up of:

(a) the **Order**, which records your details, your Plan and its price, what your Plan includes, your billing option, the date of the Price List that applies, and who accepted on your behalf;

(b) these **terms**;

(c) the **Data Processing Agreement**, which governs how we handle personal data on your behalf; and

(d) the **Price List** in force when the relevant charge is made, as shown on our website and in Settings, Billing.

1.2 If they conflict, the Data Processing Agreement wins on anything about personal data, then the Order, then these terms, then the Price List.

1.3 The person who accepts this agreement confirms they are authorised to bind your company to it.

1.4 You are a business. You confirm you are entering this agreement for the purposes of your trade, business or profession and not as a consumer.

1.5 Each of us gives the promises in this agreement in return for the other's promises. This agreement, including the Data Processing Agreement, is binding even while no fees are payable, for example during a trial or on a Black account.

## 2. Words we use

**Account**: your company's space in the platform, including its Office and Branches.

**Branch**: a branch set up in your Account, each with its own People register and Service User register.

**Billable User**: every login in your Account other than a Team Member login. **Team Member logins** are the carer logins used through the staff portal. They are free and are never Billable Users.

**Company Admin**: a user with the Company Admin role in your Account.

**Customer Data**: everything you or your users put into the platform, including Records, Checks, Forms and Evidence, and the files attached to them.

**Evidence**: a completed, stored Form submission, kept with its date, author and Form version.

**Onboarding**: the one off setup service described in clause 3.6.

**Plan**: the tier you subscribe to (for example Business or Pro), as shown on the Order.

**Platform**: the Be Care Compliant web application at becarecompliant.com and its related services.

**Record**: one person (a member of staff) or one service user held in your Account.

**Subscription Period**: one month on the Monthly option, or twelve months on the Annual option.

**Usage Credits**: AI credits and SMS credits used by the Platform's optional AI and text message features.

**Working Day**: Monday to Friday, excluding bank holidays in England and Wales.

## 3. The service

3.1 We will provide the Platform to you during this agreement, for use by your authorised users in running your business.

3.2 We will provide the Platform with reasonable skill and care, and we will use reasonable endeavours to keep it available at all times, apart from planned maintenance (which we will try to schedule outside UK office hours and tell you about in advance where it is likely to affect you) and events outside our reasonable control.

3.3 We improve the Platform regularly. We will not make a change during a paid Subscription Period that materially reduces the core features of your Plan. If we have to (for example, to comply with the law or to keep the Platform secure), we will tell you and you may end this agreement under clause 16.5.

3.4 **Support** is by email to hello@becarecompliant.com. We aim to reply within one Working Day.

3.5 **Setup.** We set up new companies ourselves. We create your Account, your first Branch and your Company Admin login, and we seed your Account with our starter Forms, Checks and training courses, which you can then change.

3.6 **Onboarding.** When you first subscribe, we provide Onboarding: we import your existing Records from the files you give us, build your own Forms, set up your Checks and walk your team through the Platform. Before we start, we agree with you in writing what will be imported and built and when it will be done. You give us your records in a form we can import and make someone available for the walkthrough. The Onboarding fee is shown in the Price List and on the Order. Where the Order shows the fee as waived, no Onboarding fee is payable.

## 4. Free trials

4.1 We may offer a free trial, usually 14 days, which starts when we set up your Account. No payment details are needed for a trial.

4.2 When a trial ends without a subscription, your Account pauses. We do not charge you. Clause 17 then applies as if this agreement had ended on the last day of the trial.

## 5. Plans, users and branches

5.1 Each Plan includes the number of Billable Users, Branches and monthly Usage Credits shown in the Price List.

5.2 Additional Billable Users and additional Branches are charged at the rates in the Price List.

5.3 Your Company Admin can see your current Billable Users, Branches and cost at any time in Settings, Billing.

5.4 When you add a Billable User or a Branch, the extra charge starts that day and is charged pro rata for the rest of the current Subscription Period. When you remove one on the Monthly option, the charge stops and any credit is applied to your next invoice. On the Annual option, a reduction takes effect from your next renewal.

5.5 **Black** accounts are granted by us at our discretion and are free of charge. We may end Black status on 30 days' notice. You can then choose a paid Plan; if you do not, your Account pauses and clause 17 applies.

5.6 Changing Plan takes effect as described in Settings, Billing at the time you change, and the new charge is shown to you before you confirm.

## 6. Monthly and Annual options

6.1 You choose Monthly or Annual when you subscribe, and the Order records your choice.

6.2 **Monthly.** Fees are billed monthly in advance. The subscription renews each month until you cancel. You can cancel at any time in Settings, Billing, and the cancellation takes effect at the end of the current monthly Subscription Period you have already paid for. If you cancel, we do not refund the rest of that Subscription Period.

6.3 **Annual.** Fees are invoiced yearly in advance at the annual price in the Price List. You commit to the full twelve months. The subscription renews for a further twelve months unless you cancel at least 30 days before the renewal date. We will remind your Company Admin by email at least 45 days before each renewal.

6.4 On the Annual option, fees already paid are not refundable if you cancel early, except where clause 16.3, 16.4 or 16.5 applies.

6.5 You may switch from Monthly to Annual at any time. You may switch from Annual to Monthly with effect from your next renewal date.

## 7. Fees and payment

7.1 All fees are in pounds sterling and exclude VAT, which we add at the current rate.

7.2 Monthly fees are paid by card through our payment provider, Stripe. Annual fees, and any Onboarding fee, are invoiced and may be paid by card or by bank transfer within 14 days of the invoice. By giving card details you authorise us to take the fees due under this agreement.

7.3 If a payment fails or an invoice is not paid on time, we will tell your Company Admin and try again. If any amount is still unpaid 14 days after we tell you, we may pause your Account under clause 15 until it is paid.

7.4 We may charge interest on overdue amounts under the Late Payment of Commercial Debts (Interest) Act 1998.

7.5 **Usage Credits.** One AI credit is used each time a user runs an AI feature, and one SMS credit for each text message sent, however long the message is. A message that fails to send does not use a credit. The monthly AI and SMS credits included in your Plan are added each month, and unused credits carry over while this agreement continues, including if you change Plan. Credit top ups are paid in advance and are not refundable, except under clause 7.7. Unused Usage Credits end when this agreement ends.

7.6 **Onboarding fee.** Any Onboarding fee is payable with your first invoice. It is not refundable once Onboarding has started, except under clause 7.7.

7.7 **Refunds when we are at fault or end the agreement.** If this agreement ends because of our serious breach (clause 16.3), because we end it (clause 16.4 or 19.3), or because you end it under clause 16.5, we will refund any Usage Credit top ups you paid for and have not used, and the part of any Onboarding fee for work we had not yet done.

## 8. Price changes

8.1 We may change the Price List. We will give your Company Admin at least 60 days' notice by email and in the Platform before a higher price applies to you.

8.2 On the Annual option, your price is fixed for the twelve months you have paid for, and any change applies from your next renewal.

8.3 If you do not accept a price rise, you may cancel before it takes effect, and on the Monthly option you will not pay the higher price.

8.4 On the Annual option, if we tell you about a higher price later than 60 days before your renewal date, the higher price does not apply to the twelve months that follow that renewal: your existing price continues for them, and the higher price can apply only from the renewal after. You may also cancel that renewal at any time before it takes effect, even if the 30 day deadline in clause 6.3 has passed.

## 9. Your responsibilities

9.1 **You are the controller** of the personal data in your Account and are responsible for having a lawful basis for putting it into the Platform, for its accuracy, and for how you use it.

9.2 **You run your compliance.** The Platform helps you record, schedule and evidence your compliance work. It does not make care decisions, and it does not replace professional judgement, your registered manager's responsibilities, or advice from your regulator (Care Inspectorate Wales, the Care Quality Commission or any other). We do not promise any particular inspection outcome or rating.

9.3 **Your content.** You are responsible for the Forms you create or change, for the Checks and recurrence rules you set, and for everything your users enter.

9.4 **Users and logins.** Accounts are invite only. Your Company Admin controls who is invited and what role each person has. Each login is for one named person. Logins must not be shared. A login can be signed in on one computer and one phone at a time. Signing in on another computer or phone signs out the earlier session of that kind.

9.5 You must tell us promptly if you believe a login has been compromised, and your Company Admin should disable it straight away.

9.6 **Acceptable use.** You and your users must not:

(a) use the Platform for anything unlawful, or to store content you have no right to hold;

(b) upload malicious code, or try to get around the Platform's security, tenant separation or role permissions;

(c) copy, reverse engineer or resell the Platform, or use it to build a competing product;

(d) use automated tools to extract data from the Platform, other than the exports and integrations we provide; or

(e) use the text message feature to send marketing, or to text anyone you do not have the right to contact.

## 10. AI and text message features

10.1 **AI features** are optional and use Usage Credits. They send the text needed for the task (for example, the details of an absence when drafting return to work questions) to our AI supplier listed in the Data Processing Agreement.

10.2 AI output can be wrong or incomplete. A suitably responsible person must check anything the AI drafts before it is relied on or sent to anyone. Once drafted and saved, AI content becomes part of your Customer Data.

10.3 **Text messages** are sent only when your users use a feature that sends them, to the numbers held in your Records. You confirm you are entitled to contact those numbers for that purpose.

## 11. Your data

11.1 **You own your Customer Data.** You give us permission to host, copy, process and display it only as needed to provide the Platform, support you, and meet our legal obligations.

11.2 **We never sell your data**, never use it for advertising, and never use it to train AI models.

11.3 We may use anonymous, aggregated information about how the Platform is used (for example, how many Checks are completed each month across all customers) to run and improve it. It will never identify you, your staff or your service users.

11.4 **Export at any time.** Your Company Admin can export your Customer Data at any time. A full export includes every Record, Check, Form, the completed Evidence as PDFs with the files attached to it, and the audit trail, as PDF and CSV files. You can also make a subject access export for one person or service user.

11.5 **Evidence is kept unchanged.** Submitted Evidence cannot be edited. Corrections are recorded as new entries, so your inspection trail stays complete.

11.6 **Retention.** You decide how long your records are kept. Settings, Data retention sets, for each type of record, a retention period and the event it is counted from (for example the date of the record, the date a member of staff leaves, the date a service user's care ends, or the date an incident is closed). We provide default periods and starting events as a starting point only; you must review them and set what your own legal and regulatory duties require. When a period ends the Platform anonymises the records automatically, unless you have placed a hold on them.

11.7 **Data protection.** The Data Processing Agreement forms part of this agreement and applies whenever we process personal data on your behalf.

11.8 **Anonymous themes from inspection reports, if you choose.** Your Company Admin can choose in the Platform to instruct us to take anonymous themes from the inspection reports you upload (for example from Care Inspectorate Wales, the Care Quality Commission or a local authority), and from nothing else of yours, and to use those themes to improve our templates and guidance for all customers. A theme is a general finding, such as "supervision records were incomplete", with no names, dates, places or other details that could identify a person or your service. We do this as your processor under the Data Processing Agreement, your reports stay in your Account, and we keep no copy of them for this purpose. Themes are never used to train AI models. This is off unless your Company Admin switches it on. If they switch it off, we take no themes from any report not already processed; themes already taken stay in our templates and guidance, because they identify no one.

## 12. Confidentiality

12.1 Each of us will keep the other's confidential information confidential, use it only for this agreement, and share it only with people who need to know it and are bound by the same duty.

12.2 This does not apply to information that is public (other than through a breach of this clause), that the receiving party already lawfully had, or that must be disclosed by law or by a regulator.

12.3 This clause continues after this agreement ends.

## 13. Intellectual property

13.1 We own the Platform, its software, design and documentation, and our template library of Forms, Checks and training courses. Nothing in this agreement transfers them to you.

13.2 We give you a non exclusive, non transferable right to use the Platform and our templates during this agreement for your own business.

13.3 Forms you create, and your copies of our templates as you have changed them, can be kept and used by you after this agreement ends, for example when printed or exported with your Evidence.

13.4 If you send us suggestions or feedback, we may use them freely.

## 14. Liability

14.1 Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot lawfully be limited or excluded.

14.2 Neither of us is liable to the other for loss of profit, revenue, business, contracts, goodwill or anticipated savings, or for any indirect or consequential loss, however it arises.

14.3 Subject to clauses 14.1 and 14.2, each party's total liability to the other for all claims arising from events in each **contract year** (the twelve months from the start date shown on the Order, and each following twelve months) is limited as follows. A claim belongs to the contract year in which the event giving rise to it happened, and related claims arising from the same event are treated as one claim.

(a) for claims relating to data protection, including breaches of the Data Processing Agreement: **twice** the amount in clause 14.4; and

(b) for all other claims: the amount in clause 14.4.

These are not added together. The amount in clause 14.3(a) is the most either of us can be liable for in total in a contract year, for all claims arising from all events in that year, and claims under clause 14.3(b) count towards it.

14.4 The amount is the greater of {{liability_floor}} and the fees paid and payable by you in the twelve months before the first event in that contract year that gives rise to a claim. The same amount applies to every claim in that contract year, whenever its event happened.

14.5 This clause does not limit your obligation to pay fees that are due.

## 15. Pausing your Account

15.1 We may pause access to your Account if fees are overdue under clause 7.3, if we reasonably believe there is a security risk to the Platform or to other customers, or if you seriously breach clause 9.6.

15.2 Where it is safe to do so we will tell you first and give you a chance to put things right. We will restore access as soon as the reason has gone.

15.3 While your Account is paused we keep your Customer Data safe, and on request we will provide an export of it.

15.4 Fees continue while your Account is paused because fees are overdue or because you breached clause 9.6. They do not continue while it is paused for a security risk you did not cause: we credit the fees you have already paid for those days against your next invoice, or refund them if there is no next invoice. If a pause that is not caused by unpaid fees or your breach lasts more than 30 days, you may end this agreement under clause 16.5.

## 16. Length of this agreement and ending it

16.1 This agreement starts when it is accepted and continues until it is ended under this clause.

16.2 **You** may end it by cancelling in Settings, Billing: on the Monthly option at the end of the current monthly Subscription Period, and on the Annual option at the end of the current annual term, giving at least 30 days' notice before the renewal date.

16.3 **Either of us** may end it immediately by written notice if the other:

(a) commits a serious breach and, if it can be put right, does not put it right within 30 days of being asked to; or

(b) becomes insolvent, enters administration or liquidation, or stops trading, except that we will not end this agreement because you have entered an insolvency procedure where the law does not allow us to.

If you end it because of our breach, we will refund any fees you have paid in advance for the period after it ends.

16.4 **We** may end it by giving at least 90 days' notice, for example if we withdraw the Platform. If we do, we will refund any fees you have paid in advance for the period after it ends.

16.5 **You** may also end it by notice, at any time and without penalty, in the situations set out in clauses 3.3, 15.4, 18 and 19, and clause 6.2 of the Data Processing Agreement. If you do, we will refund any fees you have paid in advance for the period after it ends.

## 17. What happens when it ends

17.1 When this agreement ends, your Account pauses. For the following **90 days** your Company Admin can still sign in, view your Customer Data **read only**, and export it. No fees are charged during this period. You are responsible for exporting anything you need to keep to meet your own record keeping duties.

17.2 We will remind your Company Admin by email at least 14 days before the 90 days end.

17.3 Within 30 days after the end of that 90 day period, we permanently delete your Customer Data from the Platform. Copies in our backups are overwritten on their normal cycle, and in any case within a further 30 days.

17.4 At your choice, we will return your Customer Data to you (through the read only period and full export in clause 11.4, or a full export we produce for you on request) and then delete it, or delete it sooner if you ask us in writing. We also instruct the subprocessors listed in the Data Processing Agreement to delete their copies. Some of them keep limited copies for longer under their own terms, as clause 11.2 of the Data Processing Agreement explains. Until backup copies are overwritten, they are kept secure and are not restored or used for anything except deletion.

17.5 We will confirm deletion in writing if you ask.

17.6 We keep only what we are legally required to keep, such as invoices and records of this agreement. If the law ever requires us to keep any Customer Data, clause 11.3 of the Data Processing Agreement applies.

17.7 Clauses 7 (for amounts already due and refunds under clause 7.7), 11, 12, 13.3, 14, 17 and 20 continue after this agreement ends, and the Data Processing Agreement continues until your Customer Data has been deleted.

## 18. Events outside our control

Neither of us is responsible for a delay or failure caused by something beyond our reasonable control, such as a widespread internet or power failure, a national emergency or a natural disaster. The affected party will tell the other and do what it reasonably can to limit the effect. If it prevents you using the Platform for more than 30 days, you may end this agreement under clause 16.5, and either of us may end it by notice.

## 19. Changes to these terms

19.1 We may publish a new version of these terms or the Data Processing Agreement. We will tell your Company Admin by email, and they will be asked to accept it in the Platform. We keep a record of each version you have accepted.

19.2 Except under clause 19.4, a new version applies to you only once your Company Admin accepts it. Until then the version you last accepted continues to apply, your other users carry on as normal, and your Company Admin will see the new version each time they sign in.

19.3 If your Company Admin has not accepted a new version within 60 days of our email, we may end this agreement by giving you 30 days' notice, and we will refund any fees you have paid in advance for the period after it ends. You may end this agreement under clause 16.5 at any time instead of accepting a new version.

19.4 A change we must make to comply with the law, or to protect the security of the Platform, applies from the date given in our email, which will be as far ahead as the reason for the change allows. If such a change materially disadvantages you, you may end this agreement under clause 16.5.

## 20. General

20.1 **Notices** to you are sent by email to your Company Admin, and any notice about ending this agreement, renewal or a price change is always sent by email. Other notices may also be shown in the Platform. Notices to us go to hello@becarecompliant.com. An email is treated as received on the next Working Day after it is sent, unless the sender receives a message that it was not delivered.

20.2 **Suppliers.** We may use subcontractors to provide the Platform. Those who handle personal data are listed in the Data Processing Agreement. We remain responsible for them.

20.3 **Transfer.** You may not transfer this agreement without our written consent, which we will not unreasonably refuse. We may transfer it to a company that takes over the Platform, and will tell you if we do.

20.4 **Whole agreement.** This agreement is the whole agreement between us about its subject. Neither of us is relying on anything not written in it. Your own purchase order terms do not apply.

20.5 **Waiver.** Not enforcing a right straight away does not mean giving it up.

20.6 **Severance.** If any part of this agreement is found to be unenforceable, the rest still applies.

20.7 **Third parties.** Nobody else has rights under this agreement under the Contracts (Rights of Third Parties) Act 1999.

20.8 **Law and courts.** This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.

---

## The Order

The Platform records this when your Company Admin accepts. A signed copy can be provided on request.

| | |
|---|---|
| Customer legal name | [ ] |
| Type of organisation | [Limited company / Charity / Partnership / Sole trader / Other] |
| Company or charity number, if any | [ ] |
| Registered or main address | [ ] |
| Plan | [Business / Pro / Black] |
| Price | [£ per month or per year, plus VAT] |
| Included | [users, branches, AI credits and SMS credits a month] |
| Billing option | [Monthly / Annual] |
| Price List | [Date of the Price List that applies] |
| Onboarding fee | [£295 plus VAT / Waived] |
| Start date | [ ] |
| Accepted by | [Full name], Company Admin |
| Accepted on | [Date and time], from [IP address] |
| Versions accepted | Subscription Agreement [1.0], Data Processing Agreement [1.0] |
`;

export const DATA_PROCESSING_AGREEMENT_1_0 = `# Be Care Compliant Data Processing Agreement

**{{version_line}}**

This Data Processing Agreement ("**DPA**") is between **{{supplier_name}}**, company number {{supplier_number}}, registered office {{supplier_address}}, ICO registration number {{supplier_ico}}, trading as **Be Care Compliant** ("**we**", the **processor**), and the customer named in the Order ("**you**", the **controller**).

It forms part of the Be Care Compliant Subscription Agreement (the "**Agreement**") and applies whenever we process personal data on your behalf. Words defined in the Agreement have the same meaning here.

## 1. Definitions

**Data Protection Law**: the UK GDPR, the Data Protection Act 2018, the Privacy and Electronic Communications Regulations 2003, each as amended (including by the Data (Use and Access) Act 2025), and any other law relating to personal data that applies to the processing.

**Personal Data**: personal data within Customer Data that we process on your behalf under the Agreement.

**Personal Data Breach**, **controller**, **processor**, **data subject**, **processing** and **special category data** have the meanings given in the UK GDPR.

**Subprocessor**: another processor we engage to process Personal Data.

## 2. Our roles

2.1 You are the controller of the Personal Data and we are your processor.

2.2 We are a controller in our own right only for the limited information we need to run our relationship with you and to keep the Platform secure: the names and contact details of your Company Admin and billing contact, billing details, the record of your acceptance of the Agreement, and the technical logs of our own systems (such as sign in attempts and server logs), which we use only for security, fault finding and preventing misuse. The audit trail inside your Account, of who viewed and changed your Records, is part of your Customer Data and we process it for you. Our privacy notice at becarecompliant.com/privacy explains how we use the information we control.

2.3 **Your obligations.** As controller, you are responsible for:

(a) having a lawful basis, and a condition for processing special category and criminal offence data, for everything you put into the Platform;

(b) giving your staff, service users and others the privacy information Data Protection Law requires, including that you use the Platform and its Subprocessors;

(c) making sure your instructions to us are lawful;

(d) carrying out any data protection impact assessment you need, including before using the AI and text message features;

(e) for **criminal offence data** such as DBS check results, having a condition under Schedule 1 of the Data Protection Act 2018, and an appropriate policy document where the condition you rely on requires one. We recommend you record the certificate number, date and outcome rather than uploading copies of DBS certificates, in line with the DBS Code of Practice; and

(f) if you switch on anonymous themes from inspection reports (clause 11.8 of the Agreement), being satisfied that instructing us to take them is lawful for you.

2.4 **Your rights.** You may give us instructions under clause 3, receive the help described in this DPA, and audit us under clause 13.

2.5 The subject matter, duration, nature and purpose of the processing, the types of Personal Data and the categories of data subjects are set out in **Annex 1**.

## 3. Your instructions

3.1 We process Personal Data only on your documented instructions. Your instructions are: this DPA and the Agreement; the settings, configuration and actions of your users in the Platform; and any other written instructions from your Company Admin that are consistent with the Agreement. These instructions include the transfers of Personal Data described in clause 7 and Annex 3.

3.2 If the law requires us to process Personal Data other than on your instructions, we will tell you before we do so, unless the law prevents us from telling you.

3.3 We will tell you straight away if we believe an instruction breaks Data Protection Law.

## 4. Confidentiality

Everyone we authorise to access Personal Data is bound by a duty of confidentiality, whether by contract or by law, and has access only to the extent needed for their role.

## 5. Security

5.1 We implement and maintain the technical and organisational measures in **Annex 2**, which are designed to give a level of security appropriate to the risk, taking into account that the Personal Data includes health and social care information about service users and staff.

5.2 We may update those measures over time, but we will not reduce the overall level of protection.

## 6. Subprocessors

6.1 You give us general authorisation to engage Subprocessors. Our current Subprocessors are listed in **Annex 3**.

6.2 We will tell your Company Admin at least **30 days** before we add or replace a Subprocessor, by email and in the Platform. You may object on reasonable data protection grounds within that period. If we cannot resolve your objection, you may end the Agreement before the change takes effect, and we will refund any fees you have paid in advance for the period after it ends.

6.3 We impose, by written contract, data protection terms on each Subprocessor that give at least the same protection as this DPA, and we remain responsible to you for their performance.

## 7. Transfers outside the United Kingdom

7.1 Your database, including your Records, Checks, Forms and Evidence, and your files are stored in the United Kingdom, in a London data centre region, and the application that serves them runs in London. Some supporting processing, such as our providers' system logs, backups, AI drafting, email and text message delivery, and support access by our providers' staff, may take place outside the United Kingdom, as shown in Annex 3.

7.2 Some Subprocessors process limited Personal Data outside the United Kingdom, as shown in Annex 3. We make those transfers only where Data Protection Law permits it, relying on UK adequacy regulations (including the UK Extension to the EU US Data Privacy Framework) or on the ICO's International Data Transfer Agreement or International Data Transfer Addendum, as stated for each Subprocessor.

## 8. Helping you with data subjects' rights

8.1 The Platform gives you tools to answer requests from data subjects yourself, including viewing and correcting Records, exporting everything held about a person or a service user as a subject access export, placing and lifting retention holds, and anonymisation.

8.2 If we receive a request, or a complaint, from one of your data subjects about Personal Data, we will pass it to you without undue delay, and in any event within 5 Working Days, sooner where it is plainly urgent, and will not respond to it ourselves unless you ask us to.

8.3 Where the Platform's tools are not enough, we will give you reasonable further help.

## 9. Personal Data Breaches

9.1 We will tell you without undue delay, and in any event within **48 hours**, after becoming aware of a Personal Data Breach affecting your Personal Data.

9.2 We will tell your Company Admin by email. Our contact for anything about a breach is hello@becarecompliant.com. We will give you the information you reasonably need to meet your own obligations, including notifying the regulator and the people affected. That includes what happened, the categories and approximate number of data subjects and records affected, the likely consequences, and the steps taken or proposed. Where we do not have all of it at first, we will provide it as it becomes available.

9.3 We will take reasonable steps to contain the breach and reduce its effects, and will not notify anyone else about it (other than our own advisers, insurers and law enforcement where required) without your agreement, unless the law requires it.

## 10. Helping you with your other obligations

We will give you reasonable help, taking into account the nature of the processing and the information available to us, with data protection impact assessments, prior consultation with the UK data protection supervisory authority (currently the Information Commission), notifying the people affected by a Personal Data Breach, and your obligations on security.

## 11. When the Agreement ends

11.1 When the Agreement ends, your Account becomes read only for **90 days** so you can export your Personal Data.

11.2 At your choice, we return the Personal Data to you (through the read only period and full export, or a full export we produce for you on request) and then delete it, or we delete it sooner if you ask in writing. We delete the Personal Data from the Platform within 30 days after the read only period, and instruct our Subprocessors to delete their copies. Some Subprocessors keep limited copies for longer under their own terms, as shown in Annex 3 (for example, content that Anthropic's safety systems flag); those copies stay protected under their contracts with us. Backup copies are overwritten on their normal cycle, and in any case within a further 30 days; until then they are kept secure and are not restored or used for anything except deletion.

11.3 After that we will not keep Personal Data ourselves unless the law requires us to, in which case we will keep it confidential and process it only for that purpose. Copies a Subprocessor keeps for longer under clause 11.2 are held under that Subprocessor's own terms, which we have reviewed and which bind it to keep them confidential and secure; we will tell you which Subprocessor holds any such copies if you ask.

11.4 We will confirm deletion in writing on request.

## 12. Retention while the Agreement is running

You decide how long Personal Data is kept. The Platform applies the retention period and starting event you set for each type of record in Settings, Data retention, including automatic anonymisation of records when their retention period ends and the holds you place to stop that happening.

## 13. Audits

13.1 We will make available to you the information reasonably needed to demonstrate compliance with this DPA and Article 28 of the UK GDPR.

13.2 If that information is not enough, you (or an independent auditor you appoint who is bound by confidentiality) may audit our compliance once in any twelve months, on at least 30 days' notice, between 9am and 5pm on a Working Day, at your own cost, and in a way that does not expose other customers' data. The limit of once a year and the notice period do not apply after a Personal Data Breach, where a regulator requires it, or where you have reasonable grounds to believe we are not complying with this DPA. In those cases we will not unreasonably delay or refuse an audit at shorter notice.

13.3 Our Subprocessors' own certifications and audit reports may be used to demonstrate their compliance.

## 14. Liability

Each party's liability under this DPA is subject to the limits in clause 14 of the Agreement, including the separate higher limit for data protection claims.

## 15. Changes in the law

If Data Protection Law changes in a way that affects this DPA, we may update it to keep it compliant, and clause 19 of the Agreement applies.

---

## Annex 1: Details of the processing

**Subject matter.** Providing the Be Care Compliant compliance platform to you under the Agreement.

**Duration.** For the length of the Agreement, then the read only and deletion periods in clause 11.

**Nature of the processing.** Collection through Forms and uploads, storage, organisation, retrieval, display, scheduling of Checks, calculation of compliance status, generation of reports, PDF and CSV exports, sending of emails and text messages, AI drafting where you use it, taking anonymous themes from inspection reports if you switch that on, backups, anonymisation and deletion.

**Purpose.** To let you record, schedule, evidence and report on the compliance of your staff and the care you provide, for your own regulatory, contractual, employment and quality purposes; and, only if you switch it on, to produce anonymous themes from your inspection reports under clause 11.8 of the Agreement.

**Categories of data subjects.**

(a) Your staff, including applicants you choose to hold, employees, workers, agency staff and leavers (People).

(b) The people you provide care to (Service Users), and their relatives, representatives and advocates.

(c) Your users of the Platform.

(d) People who contact you through the Platform's public forms, such as complaints and whistleblowing reports.

(e) Other people named in Records, such as professionals involved in someone's care.

**Types of Personal Data.**

(a) Identity and contact details: names, addresses, phone numbers, email addresses, job roles, next of kin.

(b) Employment and compliance records: supervisions, appraisals, spot checks, competency assessments, training records and certificates, probation reviews, right to work checks, driving documents, holiday, absence and return to work records including the employee's own answers and any fit note they upload, absence meeting records and outcome letters, signatures, and letters.

(c) Care records: care plan reviews, risk assessments, medication audits, consent reviews, quality visits, feedback, financial audits, outcomes, incidents and complaints.

(d) Files you upload, including photographs and scanned documents.

(e) Technical data held in your Account: login times, IP addresses, device and browser details as recorded in your audit trail, and the audit trail of access to and changes in Records.

**Special category and criminal offence data.**

(a) Health data about service users and staff, including care needs, medication, reasons for absence and fit notes.

(b) Any other special category data you choose to record.

(c) Information about criminal convictions and offences, such as DBS certificate details and outcomes.

## Annex 2: Security measures

**Where your data lives.** Your database and files are stored in the United Kingdom (London), and the application runs in London. Annex 3 shows the supporting processing that takes place elsewhere.

**Encryption.** Connections to the Platform are encrypted in transit using TLS. Data is encrypted at rest by our hosting providers.

**Separation between companies.** Each company's data is separated inside the database by row level security rules, not only by the application. They are designed to prevent one company reaching another's data, including where the application makes a mistake. We test this separation whenever we change the rules that enforce it.

**Role based access.** Each user has one role, such as Company Admin, Responsible Individual, Registered Manager, Branch Manager, Supervisor, Senior, On Call or Viewer, which decides which Branches, Records and features they can reach. Team Members (carer logins) see only their own portal, their own tasks and what has been assigned to them. These limits are enforced in the database as well as on screen.

**Accounts and sign in.** Accounts are invite only; there is no public sign up. Company Admins and our founder sign in with two factor authentication. A login can be signed in on one computer and one phone at a time, and signing in on another device of the same kind ends the earlier session, to discourage logins being shared.

**Files.** Files and completed Evidence are held in private storage that is not publicly accessible, and are released only through links that expire after five minutes. Downloads are recorded.

**Audit trail.** Access to and changes in Records are written to an audit trail that users cannot edit.

**Evidence integrity.** Submitted Evidence cannot be altered. It records who completed it, when, and which version of the Form was used.

**Retention.** The retention periods you set are applied automatically each night, including anonymisation of records whose retention period has ended, with holds respected.

**Our own access.** Only our founder has platform administrator access. Support access to your Account is time limited, clearly shown on screen while in use, and every action taken is recorded in the audit trail against our name. Secret keys are held only on our servers, never in the browser.

**Integrations.** Payment and message webhooks are verified by signature, and scheduled jobs are protected by secrets and refuse to run without them.

**Testing and updates.** We regularly monitor security advisories for our providers and the software we depend on, and apply fixes in a timescale that matches the risk. We review our database security checks after every change to the database, and test access controls whenever we change them.

**Backups and recovery.** There are two kinds of backup. First, our database provider takes regular backups of the database as part of its managed service; it does not guarantee where those backups are held (see Annex 3). Second, we make our own copy of uploaded files and stored Evidence documents each night, to separate private storage with the same provider in its London region in the United Kingdom. We test restoring both the database and files at least once a year and keep a record of each test.

**Incidents.** We follow a written incident procedure: contain the incident, assess what personal data is affected, tell you under clause 9, record what happened and review what we change as a result.

**People.** Anyone we allow to access Personal Data is bound by confidentiality and given only the access their role requires.

## Annex 3: Subprocessors

| Subprocessor | What it does | Personal Data involved | Where | Transfer safeguard |
|---|---|---|---|---|
| Supabase, Inc. | Database, file storage, backups and sign in | All Customer Data | Database, files and our own nightly file copies in the United Kingdom (London). Supabase's own managed database backups, system logs and support access are not guaranteed to be in the United Kingdom and may be outside it | UK Addendum to the EU Standard Contractual Clauses, in Supabase's DPA |
| Vercel Inc. | Runs the web application | Customer Data passing through the application while in use | Application runs in London. Vercel's logs and platform data may be processed in the United States | UK Extension to the EU US Data Privacy Framework, and the UK International Data Transfer Addendum in Vercel's DPA |
| Plus Five Five, Inc. (Resend) | Sends the Platform's emails | Recipient name and email address, and the content of the email | United States | UK Extension to the EU US Data Privacy Framework, and the UK Addendum to the EU Standard Contractual Clauses in Resend's DPA |
| Twilio Inc. | Sends text messages, when you use a texting feature | Recipient mobile number and the message text | United States | UK Extension to the EU US Data Privacy Framework, and the UK International Data Transfer Addendum in Twilio's DPA |
| Anthropic, PBC | AI drafting, only when one of your users presses an AI button | The text needed for that task, for example the details of an absence | United States, or other locations Anthropic uses to run its models | UK Addendum to the EU Standard Contractual Clauses, in Anthropic's DPA. Anthropic does not use this data to train its models. It deletes inputs and outputs within 30 days, except where its safety systems flag a breach of its usage policy, when it may keep them for up to two years |

**Payments.** Stripe takes your payments. It receives only your billing contact's details and your payment details, never Customer Data. It processes them for us and, for its own fraud prevention and legal duties, as a controller, so it is not a Subprocessor of Customer Data.
`;
