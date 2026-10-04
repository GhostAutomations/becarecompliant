import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionIdFromAuthCookies } from "./cookie-session.ts";

const SID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const token = `${b64u('{"alg":"HS256"}')}.${b64u(JSON.stringify({ sub: "u", session_id: SID }))}.sig`;
const sessionJson = JSON.stringify({ access_token: token, refresh_token: "r" });

test("a whole cookie, base64 encoded", () => {
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token", value: "base64-" + b64u(sessionJson) }]), SID);
});
test("a whole cookie, plain JSON", () => {
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token", value: sessionJson }]), SID);
});
test("a chunked cookie, joined in number order whatever order it arrives in", () => {
  const v = "base64-" + b64u(sessionJson);
  const a = v.slice(0, 20), b = v.slice(20, 60), c = v.slice(60);
  assert.equal(
    sessionIdFromAuthCookies([
      { name: "sb-abc123-auth-token.2", value: c },
      { name: "other", value: "x" },
      { name: "sb-abc123-auth-token.0", value: a },
      { name: "sb-abc123-auth-token.1", value: b },
    ]),
    SID,
  );
});
test("no cookie, junk, or a token without a session id gives null", () => {
  assert.equal(sessionIdFromAuthCookies([]), null);
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token", value: "base64-!!!" }]), null);
  const noSid = `${b64u("{}")}.${b64u(JSON.stringify({ sub: "u" }))}.s`;
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token", value: JSON.stringify({ access_token: noSid }) }]), null);
  const badSid = `${b64u("{}")}.${b64u(JSON.stringify({ session_id: "not-a-uuid" }))}.s`;
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token", value: JSON.stringify({ access_token: badSid }) }]), null);
});
test("the code verifier cookie is not mistaken for the session", () => {
  assert.equal(sessionIdFromAuthCookies([{ name: "sb-abc123-auth-token-code-verifier", value: sessionJson }]), null);
});
