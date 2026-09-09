import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { contactDetailsFromForm } from "./contact-details.ts";

function form(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

const full = {
  address_line1: "12 Cathedral Road",
  address_line2: "Flat 3",
  address_city: "Cardiff",
  address_county: "South Glamorgan",
  address_postcode: "CF11 9LJ",
  phone: "02920 111222",
};

describe("service user contact details", () => {
  it("reads a complete address and phone", () => {
    const r = contactDetailsFromForm(form(full));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.values.address, {
      line1: "12 Cathedral Road",
      line2: "Flat 3",
      city: "Cardiff",
      county: "South Glamorgan",
      postcode: "CF11 9LJ",
    });
    assert.equal(r.values.phone, "02920 111222");
  });

  it("leaves the optional parts out rather than storing empty strings", () => {
    const r = contactDetailsFromForm(form({ ...full, address_line2: "", address_county: "" }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(Object.keys(r.values.address).sort(), ["city", "line1", "postcode"]);
  });

  it("trims what was typed", () => {
    const r = contactDetailsFromForm(form({ ...full, address_line1: "  12 Cathedral Road  " }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.values.address.line1, "12 Cathedral Road");
  });

  it("refuses on the server, not just in the browser, and names one thing at a time", () => {
    for (const [field, error] of [
      ["address_line1", "Enter the first line of their address."],
      ["address_city", "Enter the town or city."],
      ["address_postcode", "Enter the postcode."],
      ["phone", "Enter a phone number."],
    ] as const) {
      const r = contactDetailsFromForm(form({ ...full, [field]: "" }));
      assert.equal(r.ok, false, `${field} is required`);
      if (r.ok) return;
      assert.equal(r.error, error);
    }
  });

  it("treats whitespace only as missing", () => {
    const r = contactDetailsFromForm(form({ ...full, address_postcode: "   " }));
    assert.equal(r.ok, false);
  });
});
