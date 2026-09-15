/**
 * Is this a phone or a computer?
 *
 * WHY IT MATTERS (Phil, 2026-09-15). BCC allowed ONE session per person, full stop. That was
 * sound while BCC was a desktop product. Putting task links in people's calendars changed the
 * arithmetic: every tap on a phone signed them out of their laptop, and going back to the laptop
 * signed them out of the phone, so the more useful the calendar became the more often people
 * typed their password. Phil's decision: one desktop session AND one mobile session per person.
 *
 * WHAT THAT PRESERVES. The point of single session was that a password shared with a colleague,
 * or left signed in somewhere it should not be, gets noticed because somebody gets kicked out.
 * Two slots keeps that: a second phone still evicts the first phone, a second computer still
 * evicts the first computer. It buys one extra concurrent device, not an unlimited number, and
 * it is the device kind that is capped rather than the count.
 *
 * WHAT THIS CANNOT DO, and it is better to say so than to pretend. A User-Agent is a claim the
 * client makes, not a fact. Anyone editing theirs can hold a desktop slot and a mobile slot from
 * one machine. That is a bounded cheat: two sessions instead of one, by the account's own owner,
 * which is what we just decided to allow anyway. It is not a way into somebody else's account,
 * and nothing here is a permission check. Treat this as "which of your two slots is this",
 * never as a security boundary.
 *
 * iPadOS is the known miss: since iPadOS 13 an iPad reports itself as a Macintosh, so it takes
 * the desktop slot. That is the correct answer for how an iPad is usually used, and it is not
 * worth client-side sniffing to change it.
 */

export type DeviceKind = "desktop" | "mobile";

/*
 * Deliberately short. A long list of device names is a list that rots, and every miss lands the
 * person in the desktop slot, which is the safe direction: the worst case is the old behaviour
 * for that device, not a wrongly granted extra session.
 */
const MOBILE = /Android|webOS|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile Safari|Windows Phone/i;

/** Which slot this request belongs in. Anything unrecognised, missing or empty is a desktop. */
export function deviceKindFrom(userAgent: string | null | undefined): DeviceKind {
  if (!userAgent) return "desktop";
  return MOBILE.test(userAgent) ? "mobile" : "desktop";
}

/** How the other device is described when somebody is signed out. */
export function otherDeviceWording(kind: DeviceKind): string {
  return kind === "mobile" ? "another phone or tablet" : "another computer";
}
