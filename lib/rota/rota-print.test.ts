import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRotaPrint, type PrintVisit } from "./rota-print.ts";

const v = (over: Partial<PrintVisit>): PrintVisit => ({
  date: "2026-10-19", startTime: "08:00", endTime: "08:30", serviceUserName: "A Service User", postcode: "SA1 1AA", service: "Care",
  status: "published", paused: false, carersNeeded: 1, carers: [{ personId: "p2", name: "Bea Carer" }], timeSensitive: false, ...over,
});

test("each carer A to Z with their visits in time order, double ups named, gaps listed, cancelled left out", () => {
  const doc = buildRotaPrint({
    companyName: "Test Care Ltd", branchName: "Swansea", monday: "2026-10-19", madeAt: "2026-10-17T10:00:00Z",
    visits: [
      v({ date: "2026-10-20", startTime: "12:00", endTime: "12:30" }),
      v({ carersNeeded: 2, carers: [{ personId: "p2", name: "Bea Carer" }, { personId: "p1", name: "Al Carer" }], timeSensitive: true }),
      v({ startTime: "18:00", carers: [] }),
      v({ startTime: "20:00", status: "cancelled" }),
    ],
  });
  const headings = doc.blocks.filter((b) => b.kind === "heading").map((b) => (b as { text: string }).text);
  assert.deepEqual(headings, ["Al Carer (1 visit)", "Bea Carer (2 visits)", "Visits needing a carer"]);
  const tables = doc.blocks.filter((b) => b.kind === "table") as Array<{ rows: { text: string }[][] }>;
  assert.equal(tables[1].rows[0][0].text, "Mon 19 Oct");
  assert.match(tables[1].rows[0][5].text, /Time sensitive medicine\. With Al Carer/);
  assert.equal(tables[1].rows[1][0].text, "Tue 20 Oct");
  assert.equal(tables[2].rows.length, 1);
  assert.match(tables[2].rows[0][5].text, /0 of 1 carers/);
  assert.match(doc.subtitle ?? "", /Mon 19 Oct to Sun 25 Oct/);
  assert.ok(!/\s[-–—]\s/.test(JSON.stringify(doc)));
});
