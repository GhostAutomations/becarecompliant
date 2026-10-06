import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { docxToText } from "./docx.ts";

const doc = (body: string) =>
  zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`) });

test("headings, paragraphs and list items come through in order", () => {
  const t = docxToText(
    doc(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Purpose</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">Staff must report </w:t></w:r><w:r><w:t>sickness &amp; absence.</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Phone the office</w:t></w:r></w:p>`,
    ),
  );
  assert.equal(t, "# Purpose\n\nStaff must report sickness & absence.\n\n- Phone the office");
});

test("something that is not a docx gives null", () => {
  assert.equal(docxToText(new Uint8Array([1, 2, 3])), null);
  assert.equal(docxToText(zipSync({ "other.xml": strToU8("<x/>") })), null);
});
