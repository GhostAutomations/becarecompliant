import test from "node:test";
import assert from "node:assert/strict";
import { safeNext, afterSignIn, loginPath } from "./safe-next.ts";

test("a plain path on this site is kept", () => {
  assert.equal(safeNext("/people/abc/checks/def/complete"), "/people/abc/checks/def/complete");
  assert.equal(safeNext("/planner"), "/planner");
});

test("nothing at all means no opinion", () => {
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(undefined), null);
  assert.equal(safeNext(""), null);
  assert.equal(safeNext("   "), null);
});

test("anything with a scheme is refused", () => {
  assert.equal(safeNext("https://evil.example/steal"), null);
  assert.equal(safeNext("http://evil.example"), null);
  assert.equal(safeNext("javascript:alert(1)"), null);
  assert.equal(safeNext("data:text/html,hi"), null);
});

test("protocol-relative paths are refused, slash and backslash alike", () => {
  assert.equal(safeNext("//evil.example"), null);
  assert.equal(safeNext("//evil.example/path"), null);
  assert.equal(safeNext("/\\evil.example"), null);
});

test("the query string and fragment are dropped, the path survives", () => {
  assert.equal(safeNext("/complaints?status=open"), "/complaints");
  assert.equal(safeNext("/planner#today"), "/planner");
  assert.equal(safeNext("/planner?who=mine#x"), "/planner");
});

test("a bare slash or a query-only value is no destination", () => {
  assert.equal(safeNext("/"), null);
  assert.equal(safeNext("/?x=1"), null);
});

test("the sign-in screen is never a destination", () => {
  assert.equal(safeNext("/login"), null);
  assert.equal(safeNext("/login?reason=expired"), null);
  assert.equal(safeNext("/login/whatever"), null);
});

test("traversal and control characters are refused", () => {
  assert.equal(safeNext("/people/../../etc/passwd"), null);
  assert.equal(safeNext("/people\nSet-Cookie: x"), null);
  assert.equal(safeNext("/people\r\nx"), null);
});

test("the dashboard is the fallback whenever there is no safe destination", () => {
  assert.equal(afterSignIn(null), "/dashboard");
  assert.equal(afterSignIn("https://evil.example"), "/dashboard");
  assert.equal(afterSignIn("//evil.example"), "/dashboard");
  assert.equal(afterSignIn("/login"), "/dashboard");
});

test("a real deep link survives the whole way through", () => {
  assert.equal(
    afterSignIn("/people/d7cccfcd/checks/508d93de/complete"),
    "/people/d7cccfcd/checks/508d93de/complete",
  );
});


test("the sign-in URL carries the reason and the destination together", () => {
  assert.equal(
    loginPath("signed-out-elsewhere", "/people/a/checks/b/complete"),
    "/login?reason=signed-out-elsewhere&next=%2Fpeople%2Fa%2Fchecks%2Fb%2Fcomplete",
  );
});

test("either half can be missing", () => {
  assert.equal(loginPath(null, "/planner"), "/login?next=%2Fplanner");
  assert.equal(loginPath("signed-out-elsewhere", null), "/login?reason=signed-out-elsewhere");
  assert.equal(loginPath(), "/login");
});

test("an unsafe destination is dropped, and the reason still survives", () => {
  assert.equal(loginPath("signed-out-elsewhere", "//evil.example"), "/login?reason=signed-out-elsewhere");
  assert.equal(loginPath(null, "https://evil.example"), "/login");
});
