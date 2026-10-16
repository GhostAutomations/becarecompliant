import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The map's background worker is served from public/map/maplibre (MapLibre 6 ships it as a
 * separate file that the app bundle does not carry). Those files must be the installed version's,
 * or the map breaks: after upgrading maplibre-gl, copy maplibre-gl-worker.mjs and
 * maplibre-gl-shared.mjs from node_modules/maplibre-gl/dist again and update VERSION.
 */
test("the served MapLibre worker files match the installed MapLibre", () => {
  const installed = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")).version;
  assert.equal(readFileSync("public/map/maplibre/VERSION", "utf8").trim(), installed);
  for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    assert.equal(readFileSync(`public/map/maplibre/${f}`, "utf8"), readFileSync(`node_modules/maplibre-gl/dist/${f}`, "utf8"), f);
  }
});
