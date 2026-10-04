import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { docxText, draftToSchema, extractJson, htmlText, importKindOf, isPrivateAddress, linkProblem, xlsxText } from "./ai-import.ts";

test("file kinds: PDF, Word, Excel and pictures are read; old formats and HEIC are refused with a reason", () => {
  assert.equal((importKindOf("Audit.PDF", "") as { kind: string }).kind, "pdf");
  assert.equal((importKindOf("form.docx", "") as { kind: string }).kind, "docx");
  assert.equal((importKindOf("form.xlsx", "") as { kind: string }).kind, "xlsx");
  assert.equal((importKindOf("photo.jpeg", "") as { mediaType: string }).mediaType, "image/jpeg");
  assert.match((importKindOf("photo.HEIC", "") as { error: string }).error, /HEIC/);
  assert.match((importKindOf("old.doc", "") as { error: string }).error, /\.docx/);
  assert.match((importKindOf("x.zip", "") as { error: string }).error, /Upload a PDF/);
});

test("a Word file is read paragraph by paragraph, with table cells kept apart", () => {
  const xml = `<w:document><w:body><w:p><w:r><w:t>Spot Check</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Arrived on time?</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Yes &amp; No</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
  const text = docxText(zipSync({ "word/document.xml": strToU8(xml) }));
  assert.match(text, /Spot Check/);
  assert.match(text, /Arrived on time\?/);
  assert.match(text, /Yes & No/);
});

test("an Excel file is read row by row from shared and inline strings", () => {
  const files = {
    "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="Audit" sheetId="1"/></sheets></workbook>`),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>Question</t></si><si><t>Is the MAR chart signed?</t></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Yes/No</t></is></c></row></sheetData></worksheet>`),
  };
  const text = xlsxText(zipSync(files));
  assert.match(text, /Sheet: Audit/);
  assert.match(text, /Is the MAR chart signed\?\tYes\/No/);
});

test("a web page keeps its words and a Google Form's question data, and drops other scripts", () => {
  const html = `<html><head><title>Staff survey</title><script>var x = 1;</script></head><body><div>How happy are you?</div><script>var FB_PUBLIC_LOAD_DATA_ = [null,["Q1"]];</script></body></html>`;
  const text = htmlText(html);
  assert.match(text, /Page title: Staff survey/);
  assert.match(text, /How happy are you\?/);
  assert.match(text, /Google Form data: \[null,\["Q1"\]\]/);
  assert.doesNotMatch(text, /var x/);
});

test("links: only public http(s) pages are fetched", () => {
  assert.equal(linkProblem("https://docs.google.com/forms/d/abc/viewform"), null);
  assert.ok(linkProblem("ftp://example.com/x"));
  assert.ok(linkProblem("http://localhost:3000"));
  assert.ok(linkProblem("http://192.168.1.10/form"));
  assert.ok(linkProblem("http://10.0.0.1/"));
  assert.ok(linkProblem("not a link"));
});

test("the model's reply is made safe: unique keys, known types, real choices", () => {
  const raw = extractJson('Here you go\n```json\n{"name":"Platform Audit","sections":[{"title":"Visit","fields":[{"label":"Date of visit","type":"date","required":true},{"label":"Date of visit","type":"date"},{"label":"Outcome","type":"radio","options":["Pass","Fail","Pass"]},{"label":"Care package","type":"care_package"},{"label":"Was consent given, yes or no?","type":"single_select","options":[]},{"label":""}]},{"title":"","fields":[]}]}\n```');
  const d = draftToSchema(raw, ["date_of_visit"], "t");
  assert.equal(d.name, "Platform Audit");
  assert.equal(d.schema.sections.length, 1);
  const f = d.schema.sections[0].fields;
  assert.deepEqual(f.map((x) => x.key), ["date_of_visit_2", "date_of_visit_3", "outcome", "care_package", "was_consent_given_yes_or_no"]);
  assert.equal(f[0].required, true);
  assert.deepEqual(f[2].options?.map((o) => o.value), ["pass", "fail"]);
  assert.equal(f[3].type, "short_text");
  assert.equal(f[4].type, "yes_no");
  assert.equal(d.questions, 5);
  // The simpler answer types, and "Date of visit" asked twice.
  assert.equal(d.notes.length, 2);
  assert.ok(d.notes.some((n) => /Asked twice: "Date of visit"/.test(n)));
});

test("a key never starts with a number", () => {
  const d = draftToSchema({ sections: [{ title: "A", fields: [{ label: "1. Name", type: "short_text" }] }] }, [], "t");
  assert.equal(d.schema.sections[0].fields[0].key, "q_1_name");
});

test("Birdie audit: a question's comments box is labelled Comments, a repeat is flagged, a follow up shows only on Yes", () => {
  const d = draftToSchema(
    {
      sections: [
        {
          title: "Care Planning",
          fields: [
            { label: "Are care plans updated within the last 30 days?", type: "radio", options: ["Yes", "No", "NA"] },
            { label: "Are care plans updated within the last 30 days? Comments", type: "long_text" },
          ],
        },
        {
          title: "Visit Records",
          fields: [
            { label: "Are care plans updated within the last 30 days?", type: "radio", options: ["Yes", "No", "NA"] },
            { label: "Comments", type: "long_text" },
          ],
        },
        {
          title: "Audit Summary",
          fields: [
            { label: "Follow-Up Required", type: "yes_no" },
            { label: "Follow-Up Date", type: "date", showWhen: { question: "Follow-Up Required", answers: ["Yes"] } },
            { label: "Outcome", type: "radio", options: ["Pass", "Fail"] },
            { label: "Retest date", type: "date", showWhen: { question: "Outcome", answers: ["Fail"] } },
            { label: "Ignored", type: "date", showWhen: { question: "Not a question", answers: ["Yes"] } },
          ],
        },
      ],
    },
    [],
    "t",
  );
  const [care, visits, summary] = d.schema.sections;
  assert.equal(care.fields[1].label, "Comments");
  assert.equal(care.fields[1].key, "are_care_plans_updated_within_the_last_30_days_comments");
  assert.equal(visits.fields[1].label, "Comments");
  assert.notEqual(visits.fields[1].key, care.fields[1].key);
  assert.deepEqual(summary.fields[1].visibleWhen, { field: "follow_up_required", in: ["yes"] });
  assert.deepEqual(summary.fields[3].visibleWhen, { field: "outcome", in: ["fail"] });
  assert.equal(summary.fields[4].visibleWhen, undefined);
  assert.ok(d.notes.some((n) => /Asked twice: "Are care plans updated within the last 30 days\?"/.test(n)));
  assert.ok(d.notes.some((n) => /2 questions show only when/.test(n)));
});

test("the builder marks a question asked twice, never the Comments boxes or headings", async () => {
  const { repeatedLabels } = await import("./repeated.ts");
  const twice = repeatedLabels([
    { type: "radio", label: "Are care plans updated within the last 30 days?" },
    { type: "long_text", label: "Comments" },
    { type: "radio", label: "Are care plans updated within the last 30 days" },
    { type: "long_text", label: "Comments" },
    { type: "heading", label: "Section notes" },
    { type: "heading", label: "Section notes" },
  ]);
  assert.deepEqual([...twice], ["are care plans updated within the last 30 days"]);
});

test("Platform Audit header questions are filled in automatically when imported", async () => {
  const { prefillFor } = await import("./ai-import.ts");
  assert.equal(prefillFor("Auditors Name", "short_text"), "completed_by");
  assert.equal(prefillFor("Completed by", "short_text"), "completed_by");
  assert.equal(prefillFor("Branch/Location", "short_text"), "record_branch");
  assert.equal(prefillFor("Service Users Name", "short_text"), "record_name");
  assert.equal(prefillFor("Staff member name", "short_text"), "record_name");
  assert.equal(prefillFor("Key Findings", "long_text"), undefined);
  assert.equal(prefillFor("Service Users Date of Start", "date"), "record_start_date");
  assert.equal(prefillFor("Audit Date", "date"), undefined);
});

/* Audit S9 (4 Oct 2026): every address a link could reach is judged as an address. */

test("isPrivateAddress: private, loopback, link local, CGNAT and reserved IPv4", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.255.255", "198.18.0.1", "224.0.0.1", "255.255.255.255", "999.1.1.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});
test("isPrivateAddress: public IPv4 passes", () => {
  for (const ip of ["8.8.8.8", "142.250.180.14", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.169.0.1"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
test("isPrivateAddress: IPv6 private and IPv4 hidden inside IPv6", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "[::1]", "fe80::1%eth0", "64:ff9b::a00:1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});
test("isPrivateAddress: public IPv6 and mapped public IPv4 pass", () => {
  for (const ip of ["2a00:1450:4009:81f::200e", "2606:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
test("linkProblem now refuses CGNAT and mapped literals that the text check missed", () => {
  assert.notEqual(linkProblem("http://100.64.1.2/form"), null);
  assert.notEqual(linkProblem("http://[::ffff:10.0.0.1]/form"), null);
  assert.equal(linkProblem("https://forms.example.com/a"), null);
});
