import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, normaliseForCompare } from "./extract.ts";

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
