import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY SIGN OUT SAYS WHICH SESSIONS IT ENDS (2026-09-23).
 *
 * Supabase's auth.signOut() with no argument ends EVERY session the person has. BCC allows a
 * computer and a phone at once (0273), so a bare signOut() anywhere signs somebody out of the
 * device they were not using: Phil pressed Sign out on his iPhone and his Mac went with it, and an
 * evicted phone's next click took down the new phone and the computer too. This fails npm test if
 * a bare signOut() comes back, so the choice is always made on purpose.
 */

const root = new URL("../../", import.meta.url).pathname;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("no sign out is left to Supabase's default of every device", () => {
  const bare: string[] = [];
  for (const dir of ["app", "lib", "components"]) {
    for (const f of files(join(root, dir))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/auth\.signOut\(([^)]*)\)/g)) {
        if (!/scope/.test(m[1])) bare.push(`${f.replace(root, "")}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(bare, [], `signOut() without a scope ends every session:\n${bare.join("\n")}`);
});

test("the sign out button and the eviction end only the one session", () => {
  const route = readFileSync(join(root, "app/auth/signout/route.ts"), "utf8");
  assert.match(route, /signOut\(\{ scope: "local" \}\)/);
  const guards = readFileSync(join(root, "lib/auth/guards.ts"), "utf8");
  assert.match(guards, /!stillMine\) \{[\s\S]{0,600}signOut\(\{ scope: "local" \}\)/);
});
