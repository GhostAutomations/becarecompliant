import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. office-address.ts has no runtime imports for exactly this reason. */
import {
  type BranchAddressRow,
  meetingPlaces,
  officeAddress,
  resolveBranchAddress,
} from "./office-address.ts";

const OFFICE = "1 High Street, Newport, NP20 1AA";

/** Thistle: one office, two areas it cares for. */
function thistle(): BranchAddressRow[] {
  return [
    { id: "t", name: "Thistle Care Ltd Office", kind: "team", address: OFFICE, uses_office_address: false },
    { id: "c", name: "Cardiff", kind: "branch", address: null, uses_office_address: true },
    { id: "n", name: "Newport", kind: "branch", address: null, uses_office_address: true },
  ];
}

test("THE POINT: a branch with no premises answers with the office address", () => {
  const rows = thistle();
  const office = officeAddress(rows);
  assert.deepEqual(resolveBranchAddress(rows[1], office), {
    address: OFFICE,
    inherited: true,
  });
});

test("the address is never copied, so moving office moves every branch at once", () => {
  const rows = thistle();
  rows[0].address = "9 New Road, Cardiff, CF10 1AA";
  const office = officeAddress(rows);
  assert.equal(resolveBranchAddress(rows[1], office).address, "9 New Road, Cardiff, CF10 1AA");
  assert.equal(resolveBranchAddress(rows[2], office).address, "9 New Road, Cardiff, CF10 1AA");
});

test("a branch with its own premises keeps them", () => {
  const own = "3 Queen Street, Cardiff, CF10 2BB";
  const branch: BranchAddressRow = {
    id: "c", name: "Cardiff", kind: "branch", address: own, uses_office_address: false,
  };
  assert.deepEqual(resolveBranchAddress(branch, OFFICE), { address: own, inherited: false });
});

test("the office never inherits from itself", () => {
  const office: BranchAddressRow = {
    id: "t", name: "Office", kind: "team", address: OFFICE, uses_office_address: true,
  };
  assert.deepEqual(resolveBranchAddress(office, "somewhere else"), {
    address: OFFICE,
    inherited: false,
  });
});

test("an office with no address yet gives the branches nothing, and says so", () => {
  const rows = thistle();
  rows[0].address = null;
  const office = officeAddress(rows);
  assert.equal(office, null);
  assert.deepEqual(resolveBranchAddress(rows[1], office), { address: null, inherited: true });
});

test("blank and whitespace count as no address, not as an address", () => {
  assert.equal(officeAddress([
    { id: "t", name: "Office", kind: "team", address: "   ", uses_office_address: false },
  ]), null);
  assert.equal(
    resolveBranchAddress(
      { kind: "branch", address: "", uses_office_address: false },
      OFFICE,
    ).address,
    null,
  );
});

test("THE PICKER: a branch that shares the office is not offered as a second place", () => {
  const places = meetingPlaces(thistle(), "Thistle Care Ltd");
  assert.deepEqual(
    places.map((p) => p.label),
    ["Thistle Care Ltd Office"],
  );
  assert.equal(places[0].address, OFFICE);
  assert.equal(places[0].hasAddress, true);
});

test("a branch with its own premises IS offered, alphabetically after the office", () => {
  const rows: BranchAddressRow[] = [
    { id: "n", name: "Newport", kind: "branch", address: "2 Dock Road, Newport", uses_office_address: false },
    { id: "t", name: "HQ", kind: "team", address: OFFICE, uses_office_address: false },
    { id: "c", name: "Cardiff", kind: "branch", address: "3 Queen Street, Cardiff", uses_office_address: false },
  ];
  assert.deepEqual(
    meetingPlaces(rows, "Acme Care").map((p) => p.label),
    ["Acme Care Office", "Cardiff Branch Office", "Newport Branch Office"],
  );
});

test("a branch with its own premises but no address yet is still listed, flagged", () => {
  const rows: BranchAddressRow[] = [
    { id: "t", name: "HQ", kind: "team", address: OFFICE, uses_office_address: false },
    { id: "c", name: "Cardiff", kind: "branch", address: null, uses_office_address: false },
  ];
  const places = meetingPlaces(rows, "Acme Care");
  assert.equal(places.length, 2);
  assert.equal(places[1].hasAddress, false);
  assert.equal(places[1].address, null);
});

test("the office is listed even with no address, so it can be seen and fixed", () => {
  const rows: BranchAddressRow[] = [
    { id: "t", name: "HQ", kind: "team", address: null, uses_office_address: false },
    { id: "c", name: "Cardiff", kind: "branch", address: null, uses_office_address: true },
  ];
  const places = meetingPlaces(rows, "Acme Care");
  assert.deepEqual(places.map((p) => p.label), ["Acme Care Office"]);
  assert.equal(places[0].hasAddress, false);
});
