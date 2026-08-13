import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. customer-identity.ts has no runtime imports for exactly this reason. */
import { customerIdentityPatch } from "./customer-identity.ts";

test("THE CASE THAT STARTED THIS: a renamed company gets its name corrected", () => {
  // Acme was set up as Thistle Care Wales and renamed in BCC. Stripe never heard about it.
  assert.deepEqual(
    customerIdentityPatch(
      { name: "Thistle Care Wales", email: "ppdavies@gmail.com" },
      { name: "Acme Care Company", email: "ppdavies@gmail.com" },
    ),
    { name: "Acme Care Company" },
  );
});

test("nothing changed means NO write at all, not an empty update", () => {
  assert.equal(
    customerIdentityPatch(
      { name: "Acme Care Company", email: "admin@acme.test" },
      { name: "Acme Care Company", email: "admin@acme.test" },
    ),
    null,
  );
});

test("a blank name never wipes the one Stripe already holds", () => {
  // The dangerous failure: our record is empty, so we blank the name on the invoice.
  assert.equal(customerIdentityPatch({ name: "Acme Care Company" }, { name: "" }), null);
  assert.equal(customerIdentityPatch({ name: "Acme Care Company" }, { name: "   " }), null);
  assert.equal(customerIdentityPatch({ name: "Acme Care Company" }, { name: null }), null);
  assert.equal(customerIdentityPatch({ name: "Acme Care Company" }, undefined), null);
});

test("a name Stripe does not have yet is set", () => {
  assert.deepEqual(customerIdentityPatch({ name: null }, { name: "Acme Care Company" }), {
    name: "Acme Care Company",
  });
  assert.deepEqual(customerIdentityPatch(null, { name: "Acme Care Company" }), {
    name: "Acme Care Company",
  });
});

test("whitespace alone is not a rename", () => {
  assert.equal(
    customerIdentityPatch({ name: "Acme Care Company" }, { name: "  Acme Care Company  " }),
    null,
  );
});

test("email case is not a change, or we would rewrite it every checkout", () => {
  assert.equal(
    customerIdentityPatch({ email: "PPDavies@Gmail.com" }, { email: "ppdavies@gmail.com" }),
    null,
  );
  assert.deepEqual(
    customerIdentityPatch({ email: "old@acme.test" }, { email: "new@acme.test" }),
    { email: "new@acme.test" },
  );
});

test("both can change at once", () => {
  assert.deepEqual(
    customerIdentityPatch(
      { name: "Thistle Care Wales", email: "old@acme.test" },
      { name: "Acme Care Company", email: "new@acme.test" },
    ),
    { name: "Acme Care Company", email: "new@acme.test" },
  );
});
