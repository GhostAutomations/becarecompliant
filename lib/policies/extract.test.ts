import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, normaliseForCompare, readableUrl } from "./extract.ts";

test("keeps the content, drops the furniture", () => {
  const html = `<html><body><header>Menu</header><nav>Home</nav><main><h1>Regulation 12</h1><p>The service provider must have policies &amp; procedures.</p><ul><li>Safeguarding</li><li>Medication</li></ul></main><footer>Cookies</footer><script>x()</script></body></html>`;
  const t = htmlToText(html);
  assert.match(t, /Regulation 12/);
  assert.match(t, /policies & procedures/);
  assert.match(t, /- Safeguarding/);
  assert.doesNotMatch(t, /Menu|Cookies|x\(\)/);
});

test("a reflowed page with the same words compares equal", () => {
  assert.equal(normaliseForCompare("A  b\n\nC"), normaliseForCompare("a b c"));
});

test("an empty main falls back to the body", () => {
  const words = "Lone workers must be risk assessed and have a way to raise the alarm. ".repeat(10);
  const t = htmlToText(`<html><body><main><a>Home</a></main><div id="content"><p>${words}</p></div></body></html>`);
  assert.match(t, /raise the alarm/);
});

test("a short regulation is kept short, not padded with the page", () => {
  const html = `<html><body><nav>Menu Menu Menu</nav><div id="viewLegSnippet"><div><div><p>13. The service provider must act in an open and transparent way.</p></div></div></div><footer>${"Footer ".repeat(200)}</footer></body></html>`;
  const t = htmlToText(html);
  assert.match(t, /open and transparent/);
  assert.doesNotMatch(t, /Footer|Menu/);
});

test("a GOV.UK guide is read from its print view; other pages are left alone", () => {
  assert.equal(readableUrl("https://www.gov.uk/maternity-pay-leave"), "https://www.gov.uk/maternity-pay-leave/print");
  assert.equal(readableUrl("https://www.gov.uk/government/publications/calculating-the-minimum-wage"), "https://www.gov.uk/government/publications/calculating-the-minimum-wage");
  assert.equal(readableUrl("https://www.acas.org.uk/parental-leave"), "https://www.acas.org.uk/parental-leave");
});

test("the tail of a comment at the start of the text is dropped", () => {
  const t = htmlToText(`<html><body><main> variants --> <h1>Lone working</h1><p>${"Employers must assess the risks. ".repeat(20)}</p></main></body></html>`);
  assert.doesNotMatch(t, /-->/);
});
