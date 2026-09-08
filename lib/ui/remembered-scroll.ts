/**
 * Be Care Compliant -- a board stays where you left it.
 *
 * WHY (Phil, 2026-09-08): "i move the matrix as far to the right as i could, i clicked on
 * joe bloggs and completed a new spot check, i click compliance again and the matrix is
 * back to the left." The compliance matrix is wider than any screen, so the column somebody
 * is working down is often the far right one. Every trip to a record and back put them at
 * the far left again, to scroll the whole way across looking for the person they had just
 * been on. Twenty people in a morning is twenty scrolls.
 *
 * Nothing was broken: a new page mounts a new scroll box, and a new scroll box starts at
 * zero. It just meant the board forgot, and the person had to remember for it.
 *
 * Per tab, not per person: sessionStorage, so it lasts as long as the tab is open, is never
 * shared between tabs, and is gone when the tab is closed. Where you had the board scrolled
 * an hour ago is not a preference worth keeping, and it is nobody else's business.
 *
 * Pure and self-contained (no imports) so it can be unit tested. The DOM wiring lives in
 * the hook next door.
 */

export type ScrollPosition = { left: number; top: number };

/** The bounds of a scroll container: how far it can actually go, right now. */
export type ScrollBounds = {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
};

/** Where one board's position is remembered. Namespaced so it cannot collide with
 *  anything else in the tab, and per board so two boards never inherit each other. */
export function scrollKey(board: string): string {
  return `bcc:board-scroll:${board}`;
}

/** Read back a remembered position, tolerating anything at all in the slot: storage is
 *  shared with the browser, the user and older versions of this code. */
export function parsePosition(raw: string | null | undefined): ScrollPosition | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { left, top } = parsed as { left?: unknown; top?: unknown };
    const l = typeof left === "number" && Number.isFinite(left) ? left : 0;
    const t = typeof top === "number" && Number.isFinite(top) ? top : 0;
    if (l === 0 && t === 0) return { left: 0, top: 0 };
    return { left: Math.max(0, l), top: Math.max(0, t) };
  } catch {
    return null;
  }
}

/**
 * Fit a remembered position to the board as it is NOW.
 *
 * The board is not the same width every time: a column can be turned off in Columns, a
 * branch filter can cut the rows, the window can be narrower than it was. A position saved
 * against a wider board would otherwise scroll past the end and land on empty space, which
 * looks exactly like the bug this fixes.
 */
export function clampPosition(pos: ScrollPosition, bounds: ScrollBounds): ScrollPosition {
  const maxLeft = Math.max(0, bounds.scrollWidth - bounds.clientWidth);
  const maxTop = Math.max(0, bounds.scrollHeight - bounds.clientHeight);
  return {
    left: Math.min(Math.max(0, pos.left), maxLeft),
    top: Math.min(Math.max(0, pos.top), maxTop),
  };
}

/** Worth writing down? A board sitting at the top left is the default, so remembering it
 *  is just a row of noise in storage. */
export function worthRemembering(pos: ScrollPosition): boolean {
  return pos.left > 0 || pos.top > 0;
}
