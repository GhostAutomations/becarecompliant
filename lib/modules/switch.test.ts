import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleOnInRow } from "./switch.ts";

test("a company with no switch row is off", () => {
  assert.equal(moduleOnInRow({ company_modules: [] }, "rota_visits"), false);
});

test("a switch row set on turns the module on", () => {
  assert.equal(moduleOnInRow({ company_modules: [{ module: "rota_visits", enabled: true }] }, "rota_visits"), true);
});

test("a switch row set off keeps it off (switched off again, data kept)", () => {
  assert.equal(moduleOnInRow({ company_modules: [{ module: "rota_visits", enabled: false }] }, "rota_visits"), false);
});

test("fails closed: no row, no embed, a malformed embed or a truthy non boolean", () => {
  assert.equal(moduleOnInRow(null, "rota_visits"), false);
  assert.equal(moduleOnInRow(undefined, "rota_visits"), false);
  assert.equal(moduleOnInRow({}, "rota_visits"), false);
  assert.equal(moduleOnInRow({ company_modules: "yes" }, "rota_visits"), false);
  assert.equal(moduleOnInRow({ company_modules: [null] }, "rota_visits"), false);
  assert.equal(moduleOnInRow({ company_modules: [{ module: "rota_visits", enabled: "true" }] }, "rota_visits"), false);
});

test("another module's row does not turn this one on", () => {
  assert.equal(moduleOnInRow({ company_modules: [{ module: "something_else", enabled: true }] }, "rota_visits"), false);
});
