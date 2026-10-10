/**
 * The Claude Code guard that keeps every Supabase call on Be Care Compliant.
 *
 * WHY THIS TEST EXISTS (2026-10-10): the guard in .claude/hooks/supabase-project-guard.sh only
 * switched on for tool names containing "supabase". In the desktop app the Supabase connection
 * carries a random id (mcp__d6acb2d9-...), so every call went straight past it, and nothing
 * noticed because nothing ran it. This runs the real script, under the bash that ships with
 * macOS, against the calls Claude Code would send, and checks the wiring in settings.json, so a
 * change that lets another project through fails `npm test`.
 *
 * The hook input is built with JSON.stringify, the way Claude Code builds it. A block must be
 * exit 2 AND the guard's own message: bash also exits 2 on a syntax error, which would otherwise
 * pass every blocking case while blocking for the wrong reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GUARD = ".claude/hooks/supabase-project-guard.sh";
const SETTINGS = ".claude/settings.json";
const BASH = "/bin/bash";

const BCC = "bgrtcvyjuwopunpnudeu";
const JCN = "afwfutlwuhqzdihwsibr"; // joincarenow: never touched
const CA = "bamokbdtlzllbrsdxywp"; // carer-academy: never touched
const OTHER = "aaaaaaaaaaaaaaaaaaaa"; // a made-up project

const SUPA = "mcp__d6acb2d9-dee1-40c4-b93b-2b629a3ac530"; // Supabase in the desktop app
const SUPA_CLOUD = "mcp__claude_ai_Supabase"; // Supabase in a cloud session
const VERCEL = "mcp__f09423ee-d266-410f-a49d-902bc3c277a7"; // Vercel in the desktop app
const CHROME = "mcp__claude-in-chrome";
const BROWSER = "mcp__Claude_Browser";

const BLOCK = 2;
const PASS = 0;
const BLOCKED_BY_GUARD = "Blocked by the Be Care Compliant guard";

function hookInput(tool: string, toolInput: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "s1",
    transcript_path: "/Users/someone/.claude/projects/x/s1.jsonl",
    cwd: process.cwd(),
    permission_mode: "auto",
    hook_event_name: "PreToolUse",
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: "toolu_1",
    ...extra,
  });
}

function runGuard(input: string | Buffer, env: Record<string, string> = {}) {
  const started = Date.now();
  const r = spawnSync(BASH, [GUARD], { input, env: { ...process.env, ...env }, timeout: 30_000 });
  return { code: r.status, stderr: r.stderr?.toString() ?? "", ms: Date.now() - started };
}

function expectOutcome(want: number, result: ReturnType<typeof runGuard>, label: string) {
  assert.equal(result.code, want, `${label}: wanted exit ${want}, got ${result.code}. ${result.stderr}`);
  if (want === BLOCK) assert.ok(result.stderr.includes(BLOCKED_BY_GUARD), `${label}: exit 2 without the guard's message: ${result.stderr}`);
}

type Case = [want: number, label: string, tool: string, toolInput: unknown];

const CASES: Case[] = [
  // Supabase, wrong or right project, under both names
  [BLOCK, "desktop execute_sql, made-up project", `${SUPA}__execute_sql`, { project_id: OTHER, query: "select 1" }],
  [BLOCK, "desktop execute_sql, joincarenow", `${SUPA}__execute_sql`, { project_id: JCN, query: "select 1" }],
  [BLOCK, "desktop execute_sql, carer-academy", `${SUPA}__execute_sql`, { project_id: CA, query: "select 1" }],
  [PASS, "desktop execute_sql, Be Care Compliant", `${SUPA}__execute_sql`, { project_id: BCC, query: "select 1" }],
  [BLOCK, "cloud execute_sql, joincarenow", `${SUPA_CLOUD}__execute_sql`, { project_id: JCN, query: "select 1" }],
  [PASS, "cloud execute_sql, Be Care Compliant", `${SUPA_CLOUD}__execute_sql`, { project_id: BCC, query: "select 1" }],
  [BLOCK, "desktop apply_migration, made-up project", `${SUPA}__apply_migration`, { project_id: OTHER, name: "x", query: "select 1" }],
  [PASS, "desktop apply_migration, Be Care Compliant", `${SUPA}__apply_migration`, { project_id: BCC, name: "x", query: "select 1" }],
  [BLOCK, "desktop list_tables, made-up project", `${SUPA}__list_tables`, { project_id: OTHER }],
  [PASS, "desktop list_tables, Be Care Compliant", `${SUPA}__list_tables`, { project_id: BCC }],

  // get_project takes id, not project_id
  [BLOCK, "desktop get_project, made-up project", `${SUPA}__get_project`, { id: OTHER }],
  [PASS, "desktop get_project, Be Care Compliant", `${SUPA}__get_project`, { id: BCC }],
  [BLOCK, "cloud get_project, made-up project", `${SUPA_CLOUD}__get_project`, { id: OTHER }],

  // project level Supabase tools are never used, even on Be Care Compliant
  [BLOCK, "desktop create_project", `${SUPA}__create_project`, { name: "x", region: "eu-west-2", organization_id: "org1" }],
  [BLOCK, "desktop pause_project, Be Care Compliant", `${SUPA}__pause_project`, { project_id: BCC }],
  [BLOCK, "desktop restore_project, Be Care Compliant", `${SUPA}__restore_project`, { project_id: BCC }],
  [BLOCK, "desktop create_branch, Be Care Compliant", `${SUPA}__create_branch`, { project_id: BCC, name: "develop" }],
  [BLOCK, "desktop delete_branch", `${SUPA}__delete_branch`, { branch_id: "b1" }],
  [BLOCK, "desktop merge_branch", `${SUPA}__merge_branch`, { branch_id: "b1" }],
  [BLOCK, "desktop reset_branch", `${SUPA}__reset_branch`, { branch_id: "b1", migration_version: "1" }],
  [BLOCK, "desktop rebase_branch", `${SUPA}__rebase_branch`, { branch_id: "b1" }],
  [BLOCK, "cloud create_project", `${SUPA_CLOUD}__create_project`, { name: "x", region: "eu-west-2", organization_id: "org1" }],
  [BLOCK, "cloud delete_branch", `${SUPA_CLOUD}__delete_branch`, { branch_id: "b1" }],

  // Supabase calls that name no project
  [PASS, "desktop list_projects", `${SUPA}__list_projects`, {}],
  [PASS, "desktop list_organizations", `${SUPA}__list_organizations`, {}],
  [PASS, "desktop search_docs", `${SUPA}__search_docs`, { graphql_query: '{ searchDocs(query: "rls") { nodes { title } } }' }],
  [PASS, "desktop get_cost", `${SUPA}__get_cost`, { type: "project", organization_id: "org1" }],

  // Vercel, including its own create_project and pause_project, is untouched
  [PASS, "Vercel list_deployments", `${VERCEL}__list_deployments`, { projectId: "prj_eGEI0ICcSHIIKWc4qR29XaBjk6Aa", teamId: "team_96YpBBhKikgVGZXKMGz725mJ", limit: 3 }],
  [PASS, "Vercel get_project", `${VERCEL}__get_project`, { idOrName: "prj_other", teamId: "team_1" }],
  [PASS, "Vercel pause_project", `${VERCEL}__pause_project`, { projectId: "prj_other", teamId: "team_1" }],
  [PASS, "Vercel create_project", `${VERCEL}__create_project`, { requestBody: { name: "x", framework: "nextjs" }, teamId: "team_1" }],
  [PASS, "cloud Vercel get_deployment", "mcp__claude_ai_Vercel__get_deployment", { idOrUrl: "dpl_1", teamId: "team_1" }],

  // other connections
  [PASS, "a GitHub style create_branch", "mcp__github__create_branch", { owner: "o", repo: "r", branch: "b" }],
  [PASS, "Adobe design project id", "mcp__df6826ff__export_html_to_express", { html: "<p>x</p>", claude_design_project_id: "abc" }],
  [PASS, "Docs container id", "mcp__1a59c906__read", { container: { kind: "project", id: "p1" } }],
  [PASS, "Chrome navigate", `${CHROME}__navigate`, { url: "https://example.com" }],
  [BLOCK, "an unknown connection with a wrong project_id", "mcp__someserver__do_thing", { project_id: OTHER }],

  // tricks with the input itself
  [BLOCK, "Be Care Compliant id quoted in the query, real key wrong", `${SUPA}__execute_sql`, { query: `select '"project_id": "${BCC}"'`, project_id: OTHER }],
  [BLOCK, "joincarenow id quoted in the query, real key Be Care Compliant", `${SUPA}__execute_sql`, { query: `select '"project_id": "${JCN}"'`, project_id: BCC }],
  [BLOCK, "a second project_id further in is wrong", `${SUPA}__execute_sql`, { project_id: BCC, nested: { project_id: OTHER } }],
  [BLOCK, "project_id null", `${SUPA}__execute_sql`, { project_id: null, query: "select 1" }],
  [BLOCK, "project_id a number", `${SUPA}__execute_sql`, { project_id: 123, query: "select 1" }],
  [BLOCK, "project_id empty", `${SUPA}__execute_sql`, { project_id: "", query: "select 1" }],
  [BLOCK, "project_id with a quote in it", `${SUPA}__execute_sql`, { project_id: `${BCC}"x`, query: "select 1" }],
  [BLOCK, "project_id in capitals", `${SUPA}__execute_sql`, { project_id: BCC.toUpperCase(), query: "select 1" }],
  [BLOCK, "Be Care Compliant id with a suffix", `${SUPA}__execute_sql`, { project_id: `${BCC}x`, query: "select 1" }],
  [BLOCK, "Vercel create_deployment with meta.project_id (a cautious stop, by design)", `${VERCEL}__create_deployment`, { requestBody: { name: "x", meta: { project_id: "prj_1" } } }],
  [PASS, "Vercel create_deployment with meta and no project_id", `${VERCEL}__create_deployment`, { requestBody: { name: "x", meta: { projectRef: "prj_1" } } }],

  // the two other products' ids anywhere, in any connector
  [BLOCK, "Chrome to the joincarenow dashboard", `${CHROME}__navigate`, { url: `https://supabase.com/dashboard/project/${JCN}/sql/new`, tabId: 1 }],
  [BLOCK, "built-in browser to carer-academy", `${BROWSER}__navigate`, { url: `https://supabase.com/dashboard/project/${CA}` }],
  [BLOCK, "a page script fetching the joincarenow API", `${CHROME}__javascript_tool`, { action: "javascript_exec", text: `await fetch('https://api.supabase.com/v1/projects/${JCN}/database/query')`, tabId: 1 }],
  [BLOCK, "a Vercel env var repointed at joincarenow", `${VERCEL}__edit_project_env`, { idOrName: "prj_1", id: "env_1", requestBody: { key: "NEXT_PUBLIC_SUPABASE_URL", value: `https://${JCN}.supabase.co` } }],
  [BLOCK, "the joincarenow id typed into a page", `${CHROME}__computer`, { action: "type", text: JCN }],
  [BLOCK, "a document mentioning the carer-academy id", "mcp__1a59c906__update", { ref: { object: "node", id: "n1" }, payload: `see ${CA}` }],
  [BLOCK, "the joincarenow id in capitals", `${CHROME}__navigate`, { url: `https://supabase.com/dashboard/project/${JCN.toUpperCase()}` }],

  // Supabase addresses for any project other than Be Care Compliant
  [BLOCK, "dashboard, made-up project", `${CHROME}__navigate`, { url: `https://supabase.com/dashboard/project/${OTHER}/editor` }],
  [BLOCK, "dashboard, the _ last-used shortcut", `${BROWSER}__navigate`, { url: "https://supabase.com/dashboard/project/_/settings/api" }],
  [BLOCK, "legacy app.supabase.com project", `${CHROME}__navigate`, { url: `https://app.supabase.com/project/${OTHER}` }],
  [BLOCK, "management API, made-up project", `${CHROME}__javascript_tool`, { action: "javascript_exec", text: `fetch('https://api.supabase.com/v1/projects/${OTHER}/database/query')` }],
  [BLOCK, "project host, made-up project", `${VERCEL}__edit_project_env`, { idOrName: "prj_1", id: "e", requestBody: { value: `https://${OTHER}.supabase.co` } }],
  [BLOCK, "database host, made-up project", `${CHROME}__navigate`, { url: `postgresql://postgres@db.${OTHER}.supabase.co:5432/postgres` }],
  [BLOCK, "Be Care Compliant address then another in the same call", `${CHROME}__javascript_tool`, { text: `fetch('https://${BCC}.supabase.co'); fetch('https://${OTHER}.supabase.co')` }],
  [BLOCK, "host in capitals, made-up project", `${CHROME}__navigate`, { url: `https://${OTHER.toUpperCase()}.SUPABASE.CO/rest/v1/` }],

  // Be Care Compliant and ordinary Supabase pages still open
  [PASS, "dashboard, Be Care Compliant SQL editor", `${CHROME}__navigate`, { url: `https://supabase.com/dashboard/project/${BCC}/sql/new`, tabId: 1 }],
  [PASS, "built-in browser, Be Care Compliant", `${BROWSER}__navigate`, { url: `https://supabase.com/dashboard/project/${BCC}` }],
  [PASS, "management API, Be Care Compliant", `${CHROME}__javascript_tool`, { text: `fetch('https://api.supabase.com/v1/projects/${BCC}/advisors')` }],
  [PASS, "project host, Be Care Compliant", `${VERCEL}__edit_project_env`, { idOrName: "prj_1", id: "e", requestBody: { value: `https://${BCC}.supabase.co` } }],
  [PASS, "database host, Be Care Compliant", `${CHROME}__navigate`, { url: `postgresql://postgres@db.${BCC}.supabase.co:5432/postgres` }],
  [PASS, "Supabase docs", `${CHROME}__navigate`, { url: "https://supabase.com/docs/guides/database/postgres/row-level-security" }],
  [PASS, "dashboard project list", `${CHROME}__navigate`, { url: "https://supabase.com/dashboard/projects" }],
  [PASS, "Supabase status page", `${CHROME}__navigate`, { url: "https://status.supabase.com" }],
  [PASS, "the production site", `${CHROME}__navigate`, { url: "https://www.becarecompliant.com/login" }],
];

for (const [want, label, tool, toolInput] of CASES) {
  test(`guard: ${label}`, () => expectOutcome(want, runGuard(hookInput(tool, toolInput)), label));
}

test("guard: pretty printed input with new lines around the key", () => {
  const input = JSON.stringify(JSON.parse(hookInput(`${SUPA}__execute_sql`, { query: "select 1", project_id: OTHER })), null, 2);
  expectOutcome(BLOCK, runGuard(input), "pretty printed");
});

test("guard: hook text written into the session fields cannot fool it", () => {
  const sneaky = `"tool_input":{"project_id":"${BCC}"} "tool_name":"x"`;
  const input = hookInput(`${SUPA}__execute_sql`, { project_id: OTHER, query: "select 1" }, { cwd: sneaky, transcript_path: sneaky });
  expectOutcome(BLOCK, runGuard(input), "session fields");
});

test("guard: an unreadable payload is blocked", () => {
  expectOutcome(BLOCK, runGuard("not json"), "unreadable payload");
});

test("guard: big calls are answered fast, with the project id last", () => {
  // Cutting the text with ${rest#*...} took 30 s at 250 KB and minutes at 1 MB; a stall past
  // the hook timeout would let the call through, so speed is part of being correct.
  for (const size of [256_000, 5_000_000]) {
    for (const [want, project] of [[PASS, BCC], [BLOCK, OTHER]] as const) {
      const code = "// — x\n".repeat(Math.ceil(size / 8)).slice(0, size);
      const toolInput = { entrypoint_path: "index.ts", files: [{ name: "index.ts", content: code }], name: "fn", project_id: project };
      const result = runGuard(hookInput(`${SUPA}__deploy_edge_function`, toolInput));
      const label = `${size} byte edge function, ${project === BCC ? "Be Care Compliant" : "made-up project"} last`;
      expectOutcome(want, result, label);
      assert.ok(result.ms < 5_000, `${label}: took ${result.ms} ms`);
    }
  }
  const script = "// x\n".repeat(1_250_000) + `fetch("https://${OTHER}.supabase.co")`;
  const result = runGuard(hookInput(`${CHROME}__javascript_tool`, { text: script }));
  expectOutcome(BLOCK, result, "5 MB page script, made-up host at the end");
  assert.ok(result.ms < 5_000, `5 MB page script took ${result.ms} ms`);
});

test("guard: an em dash cannot hide a wrong project in any locale", () => {
  // Under some multibyte locales bash's regex used to give up at the first such character and
  // read "no project_id". The guard now sets LC_ALL=C itself. A locale this machine lacks
  // falls back to C, so the case still runs.
  const input = hookInput(`${SUPA}__execute_sql`, { query: "update checks set note = 'Fee — paid' where id = 1", project_id: OTHER });
  for (const locale of ["ja_JP.eucJP", "zh_CN.GB18030", "en_GB.UTF-8", "C"]) {
    expectOutcome(BLOCK, runGuard(input, { LC_ALL: locale, LANG: locale }), `em dash under ${locale}`);
  }
});

test("guard: a raw invalid byte cannot hide a wrong project", () => {
  const [head, tail] = hookInput(`${SUPA}__execute_sql`, { query: "x MARK y", project_id: OTHER }).split("MARK");
  const input = Buffer.concat([Buffer.from(head), Buffer.from([0xff, 0xfe]), Buffer.from(tail)]);
  expectOutcome(BLOCK, runGuard(input, { LC_ALL: "en_GB.UTF-8" }), "invalid byte under UTF-8");
});

test("settings: the hook runs on every connector, fails closed, and points at the guard", () => {
  // The original fault was here, not in the script: the matcher only matched names
  // containing "supabase".
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  const entry = settings.hooks.PreToolUse.find((h: { hooks: { args?: string[] }[] }) =>
    h.hooks.some((x) => x.args?.some((a) => a.endsWith(GUARD))),
  );
  assert.ok(entry, "no PreToolUse hook runs the guard");
  const matcher = new RegExp(entry.matcher);
  for (const tool of [`${SUPA}__execute_sql`, `${SUPA_CLOUD}__execute_sql`, `${VERCEL}__edit_project_env`, `${CHROME}__navigate`, `${BROWSER}__navigate`]) {
    assert.ok(matcher.test(tool), `the hook matcher ${entry.matcher} misses ${tool}`);
  }
  const hook = entry.hooks.find((x: { args?: string[] }) => x.args?.some((a) => a.endsWith(GUARD)));
  assert.equal(hook.onFailure, "block", "a missing, crashed or stalled guard must block the call");
  assert.ok(typeof hook.timeout === "number" && hook.timeout <= 60, "the guard needs a short timeout");
});

test("settings: migrations, edge function deploys and Vercel env tools always ask, under both names", () => {
  const ask: string[] = JSON.parse(readFileSync(SETTINGS, "utf8")).permissions.ask;
  for (const server of [SUPA, SUPA_CLOUD]) {
    for (const tool of ["apply_migration", "deploy_edge_function"]) assert.ok(ask.includes(`${server}__${tool}`), `${server}__${tool} does not ask`);
  }
  for (const server of [VERCEL, "mcp__claude_ai_Vercel"]) {
    for (const tool of ["create_project_env", "edit_project_env", "filter_project_envs", "get_project_env", "get_shared_env_var"]) {
      assert.ok(ask.includes(`${server}__${tool}`), `${server}__${tool} does not ask`);
    }
  }
});
