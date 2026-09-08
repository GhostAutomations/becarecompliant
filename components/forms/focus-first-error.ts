"use client";

/**
 * Be Care Compliant — take the person to the answer that is missing.
 *
 * WHY (Phil, 2026-09-08): "if you forget to put a reason in when you try to click submit
 * to complete the form, nothing happens, but it doesn't tell you you've not put a reason
 * in down the bottom." The error WAS rendered, under the field, forty questions above the
 * button they had just pressed. On a long form an error you cannot see is the same as no
 * error at all: the button looks broken.
 *
 * Every control the shared renderer draws carries id `${idPrefix}-${field.key}`, and the
 * shared validator returns errors in document order, so the first error is the first
 * unanswered question on the page. Scroll to it and focus it.
 *
 * Best effort by design: a control that cannot take focus (a signature pad) is still
 * scrolled to, and a field that is not on the page is simply skipped rather than throwing
 * on a form that is otherwise fine.
 */

export function focusFirstError(errors: ReadonlyArray<{ key: string }>, idPrefix = "f"): void {
  const first = errors[0];
  if (!first || typeof document === "undefined") return;
  const el = document.getElementById(`${idPrefix}-${first.key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof (el as HTMLElement).focus === "function") {
    (el as HTMLElement).focus({ preventScroll: true });
  }
}
