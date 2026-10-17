import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeXml, parseLookup, parseVmps } from "./parse.ts";

const LOOKUP = `<?xml version="1.0" encoding="utf-8"?>
<LOOKUP>
  <ONT_FORM_ROUTE><INFO><CD>1</CD><DESC>tablet.oral</DESC></INFO></ONT_FORM_ROUTE>
  <FORM>
    <INFO><CD>385055001</CD><CDDT>2004-01-01</CDDT><DESC>Tablet</DESC></INFO>
    <INFO><CD>385219001</CD><DESC>Solution for injection</DESC></INFO>
  </FORM>
  <ROUTE>
    <INFO><CD>26643006</CD><DESC>Oral</DESC></INFO>
    <INFO><CD>34206005</CD><DESC>Subcutaneous</DESC></INFO>
  </ROUTE>
</LOOKUP>`;

const VMP = `<?xml version="1.0" encoding="utf-8"?>
<VIRTUAL_MED_PRODUCTS>
  <VMPS>
    <VMP><VPID>39720311000001101</VPID><VTMID>90332006</VTMID><NM>Paracetamol 500mg tablets</NM><BASISCD>0001</BASISCD></VMP>
    <VMP><VPID>111</VPID><INVALID>1</INVALID><NM>Old product &amp; co</NM></VMP>
    <VMP><VPID>222</VPID><NM>Insulin glargine 100units/ml solution for injection 3ml pre-filled pens</NM></VMP>
  </VMPS>
  <DRUG_FORM>
    <DFORM><VPID>39720311000001101</VPID><FORMCD>385055001</FORMCD></DFORM>
    <DFORM><VPID>222</VPID><FORMCD>385219001</FORMCD></DFORM>
  </DRUG_FORM>
  <DRUG_ROUTE>
    <DROUTE><VPID>39720311000001101</VPID><ROUTECD>26643006</ROUTECD></DROUTE>
    <DROUTE><VPID>222</VPID><ROUTECD>34206005</ROUTECD></DROUTE>
    <DROUTE><VPID>222</VPID><ROUTECD>34206005</ROUTECD></DROUTE>
  </DRUG_ROUTE>
</VIRTUAL_MED_PRODUCTS>`;

test("XML entities are decoded", () => {
  assert.equal(decodeXml("A &amp; B &lt;5&gt; &#163;3 &#x2019;"), "A & B <5> £3 ’");
});

test("the lookup file gives forms and routes in words, not the other code lists", () => {
  const l = parseLookup(LOOKUP);
  assert.equal(l.forms.get("385055001"), "Tablet");
  assert.equal(l.routes.get("34206005"), "Subcutaneous");
  assert.equal(l.forms.has("1"), false);
});

test("products with their form and routes; invalid ones marked; repeats dropped", () => {
  const rows = parseVmps(VMP, parseLookup(LOOKUP));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { id: "39720311000001101", name: "Paracetamol 500mg tablets", form: "Tablet", routes: ["Oral"], invalid: false });
  assert.deepEqual(rows[1], { id: "111", name: "Old product & co", form: null, routes: [], invalid: true });
  assert.deepEqual(rows[2].routes, ["Subcutaneous"]);
  assert.equal(rows[2].form, "Solution for injection");
});
