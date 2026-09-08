import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  clampPosition,
  parsePosition,
  scrollKey,
  worthRemembering,
} from "./remembered-scroll.ts";

const WIDE = { scrollWidth: 3000, clientWidth: 1000, scrollHeight: 2000, clientHeight: 800 };

test("each board remembers its own place", () => {
  assert.equal(scrollKey("people:active"), "bcc:board-scroll:people:active");
  assert.notEqual(scrollKey("people:active"), scrollKey("people:leaver"));
  assert.notEqual(scrollKey("people:active"), scrollKey("service-users"));
});

test("a remembered position reads back", () => {
  assert.deepEqual(parsePosition(JSON.stringify({ left: 1240, top: 60 })), { left: 1240, top: 60 });
});

test("nothing remembered is nothing restored", () => {
  assert.equal(parsePosition(null), null);
  assert.equal(parsePosition(undefined), null);
  assert.equal(parsePosition(""), null);
});

test("rubbish in the slot is ignored rather than thrown on", () => {
  assert.equal(parsePosition("not json"), null);
  assert.equal(parsePosition("[1,2,3]"), null);
  assert.equal(parsePosition("null"), null);
  assert.equal(parsePosition('"1240"'), null);
  assert.deepEqual(parsePosition(JSON.stringify({ left: "far", top: 60 })), { left: 0, top: 60 });
  assert.deepEqual(parsePosition(JSON.stringify({ left: Infinity, top: NaN })), { left: 0, top: 0 });
  assert.deepEqual(parsePosition(JSON.stringify({ left: -50, top: -1 })), { left: 0, top: 0 });
});

test("the far right is restorable", () => {
  assert.deepEqual(clampPosition({ left: 2000, top: 1200 }, WIDE), { left: 2000, top: 1200 });
});

test("a position saved against a wider board is pulled back to this one", () => {
  /* A column turned off, a branch filtered, a narrower window: scrolling past the end
     would land on empty space, which looks exactly like the bug this fixes. */
  assert.deepEqual(clampPosition({ left: 9999, top: 9999 }, WIDE), { left: 2000, top: 1200 });
});

test("a board with nothing to scroll goes nowhere", () => {
  const narrow = { scrollWidth: 800, clientWidth: 1000, scrollHeight: 400, clientHeight: 800 };
  assert.deepEqual(clampPosition({ left: 1240, top: 60 }, narrow), { left: 0, top: 0 });
});

test("the top left is not worth writing down", () => {
  assert.equal(worthRemembering({ left: 0, top: 0 }), false);
  assert.equal(worthRemembering({ left: 1, top: 0 }), true);
  assert.equal(worthRemembering({ left: 0, top: 1 }), true);
});
