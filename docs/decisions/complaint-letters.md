# Complaint responses as signed PDF letters (Phil, 2026-10-12, THE LIST 54)

- [stated] The Initial Response and the Complaint Response are letters laid out like the absence
  letters and drawn by the same PDF layout: the company letterhead (the complaint's branch office when
  it has premises of its own, else the main office), the date, Private and confidential, the
  complainant's name (and postal address when they asked for post), "Dear" with the title and surname
  when the name starts with a title ("Mrs Jo Example" is "Dear Mrs Example"), otherwise the name as
  recorded, and "Dear Sir or Madam" when none (Phil, popup 2026-10-12), an RE line with the complaint reference, the words, Yours
  sincerely, the signature choice, name and job title.
- [stated] The editor and the PDF side by side, the whole letter on the editor page, the signature box
  under the words and the send box beside it, as the outcome letter.
- [stated] Email complainant: Approve and send emails the letter in the email body with the signed
  PDF attached (and any ticked investigation files, for the full response); the PDF is kept on the
  complaint. Subject "Your complaint, reference X" or "Our response to your complaint, reference X".
- [stated] Postal complainant: Save and print keeps the signed PDF on the complaint and opens it to
  print and post. No copy and paste onto headed paper.
- [stated] The name and job title under Yours sincerely are whoever sends it (their job title from
  Settings, Users), signed or not.
- [stated] Nothing is drafted until Draft the letter (gold AI chip) is pressed; the draft is kept on
  the complaint, so opening the box again costs nothing. Regenerate spends a new credit. A draft with
  no usable words is not kept and its credit is given back.
- The AI writes only the words between Dear and Yours sincerely (no greeting, sign off, addresses,
  date, reference or headings); its text is tidied like the absence letters (dates in full, small
  numbers in words, no dashes). The full response never discloses staff or HR matters.
- Each sent or kept letter is a complaint_responses row with the PDF (0448: pdf_path in the company's
  folder, sha256), opened from the response's page through an audited, short lived link.
- A test company sends no email: the letter is kept and marked as not emailed, and the message says so.
- [stated] Each kept letter is copied to the company's cloud drive, into the Complaints folder beside
  the complaint's forms, named "<date> Complaint <reference> initial response letter" (or complaint
  response letter), " (2)" for a second the same day (Phil, 2026-10-12). Letters kept before a drive
  is connected go with the first full copy.

