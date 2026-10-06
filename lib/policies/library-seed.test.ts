import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SEED_FINGERPRINT, SEED_SOURCES, SEED_TOPICS, SEED_VERSION } from "./library-seed.ts";

test("the seed version is raised whenever the library changes", () => {
  const now = createHash("sha256").update(JSON.stringify({ SEED_SOURCES, SEED_TOPICS })).digest("hex").slice(0, 16);
  assert.equal(
    SEED_FINGERPRINT,
    now,
    `The policy library changed. Raise SEED_VERSION (now ${SEED_VERSION}) by one and set SEED_FINGERPRINT to "${now}".`,
  );
});

test("every source a policy uses is in the library, and keys are unique", () => {
  const keys = SEED_SOURCES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of SEED_TOPICS) for (const k of t.sourceKeys) assert.ok(keys.includes(k), `${t.key} uses missing source ${k}`);
});

test("HSE guides are read from their printable whole-guide page", () => {
  // Phil, 2026-10-06: HSE index pages are a page of links; the AI got a menu, not the guidance.
  for (const s of SEED_SOURCES.filter((x) => x.url.includes("hse.gov.uk"))) {
    assert.ok(s.url.endsWith("/print.htm"), `${s.key} should link the print.htm guide, not ${s.url}`);
  }
});
