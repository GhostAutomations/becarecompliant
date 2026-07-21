import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guard against the "green Saved/Sent RECTANGLE" bug (cost hours, 2026-07-21).
 *
 * Root cause: `.btn-saved` (the class every save/send button switches to on
 * success) was not listed in the shared base-button grouped selector in
 * globals.css, so it inherited NONE of the button shape (padding, radius,
 * inline-flex, font). The moment a button became `.btn-saved` it collapsed into
 * a bare coloured rectangle. This test fails if that regresses.
 *
 * The rule: EVERY save/send button turns green and reads Saved/Sent and stays
 * until its section is edited. It must always look like a real button.
 */

const css = readFileSync("app/globals.css", "utf8");

test(".btn-saved is in the shared base-button group (keeps button shape, never a bare rectangle)", () => {
  // The shared base block: the selector list that @applies the common button
  // shape (inline-flex ... rounded-xl ... px/py). Grab the selectors before it.
  const base = css.match(
    /([^{}]*?)\{\s*@apply[^}]*\binline-flex\b[^}]*\brounded-xl\b[^}]*\}/,
  );
  assert.ok(base, "Could not find the shared base button @apply block in app/globals.css.");
  assert.match(
    base[1],
    /\.btn-saved\b/,
    "`.btn-saved` MUST be listed in the shared base button group in app/globals.css so the green Saved/Sent state keeps the full button shape. Without it, the saved state collapses into a bare green rectangle (the bug Phil hit repeatedly). Re-add `.btn-saved,` to that grouped selector.",
  );
});

test(".btn-saved has a solid fill (a proper button, not a faint tag)", () => {
  // Two blocks reference `.btn-saved`: the shared shape group and its own colour
  // rule. At least one must set a background fill.
  const blocks = [...css.matchAll(/\.btn-saved\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(blocks.length > 0, "`.btn-saved` rule not found in app/globals.css.");
  assert.ok(
    blocks.some((b) => /\bbg-/.test(b)),
    "`.btn-saved` must have a background fill (bg-*) so the saved state reads as a solid green button.",
  );
});
