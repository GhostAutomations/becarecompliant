/**
 * Be Care Compliant — which department a URL belongs to.
 *
 * Pure and deliberately IMPORTLESS so node --test can load it. This is the thing that decides
 * whether a request is allowed through, and it should not be a module that can only be checked by
 * clicking around.
 *
 * WHY A PATH MAP AND NOT A GUARD IN EVERY PAGE. There are 102 pages under (app). A guard per page
 * is 102 chances to forget one, and the one that gets forgotten is a page somebody reaches by
 * typing the URL. Worse, it is the same shape as the fault this whole feature exists to end: a
 * list of roles in one more place, drifting from the others. One map, one gate in middleware, and
 * a page added tomorrow under an existing department is covered the moment it exists.
 *
 * LONGEST PREFIX WINS, so /people/training is Training and not People. Order in the table does
 * not matter, which means nobody has to remember to keep it sorted.
 *
 * A PATH THAT MATCHES NOTHING IS NOT GATED. /my, /welcome, /evidence, /settings' own children and
 * every API route are not departments, and a gate that guessed at them would lock people out of
 * pages this feature was never asked to govern.
 */

import type { ModuleKey } from "./module-catalogue";

/** Prefix to department. A path matches a prefix exactly, or continues with "/". */
const PATHS: ReadonlyArray<readonly [string, ModuleKey]> = [
  ["/dashboard", "dashboard"],
  ["/people", "people"],
  ["/people/training", "training"],
  ["/people/holiday", "holiday"],
  ["/people/absence", "absence"],
  ["/service-users", "service_users"],
  ["/complaints", "complaints"],
  ["/incidents", "incidents"],
  ["/whistleblowing", "whistleblowing"],
  ["/briefings", "briefings"],
  ["/on-call", "on_call"],
  ["/planner", "planner"],
  ["/invoicing", "invoicing"],
  ["/readiness", "readiness"],
  ["/reports", "reports"],
  ["/settings", "settings"],
];

/** Where somebody is sent when a department is switched off for their role. Never gated itself,
 *  because a gate that redirects into a gated page is a redirect loop. */
export const NO_ACCESS_PATH = "/no-access";

export function moduleForPath(pathname: string): ModuleKey | null {
  let best: readonly [string, ModuleKey] | null = null;
  for (const entry of PATHS) {
    const [prefix] = entry;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best[0].length) best = entry;
    }
  }
  return best ? best[1] : null;
}
