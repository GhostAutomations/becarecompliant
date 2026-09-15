import test from "node:test";
import assert from "node:assert/strict";
import { deviceKindFrom, otherDeviceWording } from "./device-kind.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test("a phone takes the mobile slot", () => {
  assert.equal(deviceKindFrom(IPHONE), "mobile");
  assert.equal(deviceKindFrom(ANDROID), "mobile");
});

test("a computer takes the desktop slot", () => {
  assert.equal(deviceKindFrom(MAC), "desktop");
  assert.equal(deviceKindFrom(WINDOWS), "desktop");
});

test("anything unknown or missing is a desktop, which is the safe direction", () => {
  assert.equal(deviceKindFrom(null), "desktop");
  assert.equal(deviceKindFrom(undefined), "desktop");
  assert.equal(deviceKindFrom(""), "desktop");
  assert.equal(deviceKindFrom("curl/8.4.0"), "desktop");
  assert.equal(deviceKindFrom("some-future-browser/1.0"), "desktop");
});

test("an iPad on iPadOS 13 and later takes the desktop slot, and that is on purpose", () => {
  // Since iPadOS 13 Safari reports itself as a Macintosh. Documented, not a bug.
  const IPAD_MODERN =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  assert.equal(deviceKindFrom(IPAD_MODERN), "desktop");
  // An older iPad still identifies itself and gets the mobile slot.
  const IPAD_OLD =
    "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
  assert.equal(deviceKindFrom(IPAD_OLD), "mobile");
});

test("the wording names the right kind of other device", () => {
  assert.equal(otherDeviceWording("mobile"), "another phone or tablet");
  assert.equal(otherDeviceWording("desktop"), "another computer");
});
