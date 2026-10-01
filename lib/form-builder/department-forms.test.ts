import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentFor } from "./department-forms.ts";

test("department forms say where they are used", () => {
  assert.equal(departmentFor({ key: "holiday_requests", population: "people" }), "Holiday");
  assert.equal(departmentFor({ key: "dbs_renewal", population: "people" }), "People register, DBS");
  assert.equal(departmentFor({ key: "incident_report", population: "incidents" }), "Incidents");
});

test("check forms are not department forms", () => {
  assert.equal(departmentFor({ key: "supervision", population: "people" }), null);
  assert.equal(departmentFor({ key: "care_plan_review", population: "service_users" }), null);
  assert.equal(departmentFor({ key: "my_own_form", population: "people" }), null);
});

test("a renamed copy keeps its library key", () => {
  assert.equal(departmentFor({ key: "rtw_copy", sourceTemplateKey: "return_to_work", population: "people" }), "Absence, Return to Work");
});

test("a company's own complaints or incidents form counts by population", () => {
  assert.equal(departmentFor({ key: "my_complaint", population: "complaints" }), "Complaints");
  assert.equal(departmentFor({ key: "my_incident", population: "incidents" }), "Incidents");
});
