import path from "path";
import { fileURLToPath } from "url";
import { parseExpress } from "../lib/parsers/express.mjs";
import { CONFIG_DEFAULTS } from "../lib/config.mjs";
import { classifyAll } from "../lib/auth.mjs";
import { runner, assertEq, assertDeepEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "sample-app");

const t = runner("ApiGate · parser-express");

const { endpoints } = parseExpress(fixture, ["node_modules/**"]);
const byKey = (m, p) => endpoints.find(e => e.method === m && e.path === p);

t.test("discovers app.get('/health')", () => {
  const e = byKey("GET", "/health");
  if (!e) throw new Error("/health not found");
  assertEq(e.framework, "express");
});

t.test("resolves usersRouter mount prefix", () => {
  const e = byKey("GET", "/users/:id");
  if (!e) throw new Error("/users/:id not found");
  assertEq(e.resolved, true);
});

t.test("resolves usersRouter POST mount", () => {
  const e = byKey("POST", "/users");
  if (!e) throw new Error("POST /users not found");
});

t.test("resolves billingRouter DELETE mount", () => {
  const e = byKey("GET", "/billing/invoice/:id");
  if (!e) throw new Error("GET /billing/invoice/:id not found");
});

t.test("captures auth marker requireAuth", () => {
  const e = byKey("GET", "/users/:id");
  if (!e.authMarkers.includes("requireAuth")) {
    throw new Error("requireAuth marker missing");
  }
});

t.test("flags dynamic mount as unresolved", () => {
  const unresolved = endpoints.filter(e => e.resolved === false);
  if (unresolved.length === 0) throw new Error("expected at least one UNRESOLVED endpoint");
});

t.test("never guesses a path for unresolved mount", () => {
  const unresolved = endpoints.filter(e => e.resolved === false);
  for (const e of unresolved) {
    if (e.path !== null) throw new Error(`unresolved endpoint has non-null path: ${e.path}`);
  }
});

// Issue #7: any router name, route() chains, router-level auth.
const patternsFixture = path.join(__dirname, "fixtures", "express-router-patterns");
const patterns = classifyAll(parseExpress(patternsFixture, []).endpoints, CONFIG_DEFAULTS);
const summarize = (file) => patterns
  .filter(e => e.file === file)
  .map(e => `${e.method} ${e.path} ${e.posture}`)
  .sort();

t.test("express-router-patterns/app.js yields exactly the four expected routes", () => {
  assertDeepEq(summarize("app.js"), [
    "DELETE /admin/wipe GUARDED",
    "GET /internal/stats OPEN",
    "GET /items OPEN",
    "POST /items OPEN"
  ]);
});

t.test("router-level X.use(requireAuth) marks later routes with requireAuth", () => {
  const e = patterns.find(x => x.file === "app.js" && x.method === "DELETE");
  assertEq(e.matchedAuthMarker, "requireAuth");
});

t.test("route() chain endpoints point at their own line", () => {
  const lines = patterns.filter(x => x.file === "use-order.js" && x.path === "/admin/reports").map(x => x.line).sort();
  assertDeepEq(lines, [13, 14]);
});

t.test("use order: routes before X.use(auth) stay OPEN, after are GUARDED; route() per-method mw", () => {
  assertDeepEq(summarize("use-order.js"), [
    "GET /admin/early OPEN",
    "GET /admin/late GUARDED",
    "GET /admin/reports GUARDED",
    "GET /after-dynamic OPEN",
    "GET /panel/ping OPEN",
    "POST /admin/reports OPEN"
  ]);
});

// Path-less X.use(mw) must never turn an open route GUARDED. False OPEN is
// the accepted direction (e.g. `this.router.use(auth)` is ignored).
const negativesFixture = path.join(__dirname, "fixtures", "express-router-negatives");
const negatives = classifyAll(parseExpress(negativesFixture, []).endpoints, CONFIG_DEFAULTS);
const summarizeNeg = (file) => negatives
  .filter(e => e.file === file)
  .map(e => `${e.method} ${e.path} ${e.posture}`)
  .sort();

t.test("use(): same name in two functions is two routers", () => {
  assertDeepEq(summarizeNeg("shadowed-factories.js"), ["GET /a GUARDED", "POST /signup OPEN"]);
});

t.test("use(): this.router in two classes does not leak", () => {
  assertDeepEq(summarizeNeg("this-router.js"), ["GET /a OPEN", "POST /signup OPEN"]);
});

t.test("use(): (app) params in two functions do not leak", () => {
  assertDeepEq(summarizeNeg("param-app.js"), ["GET /a OPEN", "POST /signup OPEN"]);
});

t.test("use(): reassigned router variable is ignored", () => {
  assertDeepEq(summarizeNeg("reassigned.js"), ["GET /a OPEN", "POST /b OPEN"]);
});

t.test("use(): conditional use and use inside a helper function are ignored", () => {
  assertDeepEq(summarizeNeg("conditional-use.js"), ["DELETE /wipe OPEN", "POST /open OPEN"]);
});

t.test("use(): call expression as first of 2+ args is not path-less", () => {
  assertDeepEq(summarizeNeg("call-prefix.js"), ["POST /public OPEN"]);
});

t.test("use(): jwt().unless(...) is not router-wide auth", () => {
  assertDeepEq(summarizeNeg("unless.js"), ["POST /guarded GUARDED", "POST /webhook OPEN"]);
});

t.test("use(): express.json(), imported router and error handler are not auth", () => {
  assertDeepEq(summarizeNeg("harmless-use.js"), ["POST /items OPEN"]);
});

// Issue #8: routers defined in one file and mounted in another.
const multiFixture = path.join(__dirname, "fixtures", "express-multifile");
const multiEndpoints = parseExpress(multiFixture, []).endpoints;
const multi = classifyAll(multiEndpoints, CONFIG_DEFAULTS);
const summarizeMulti = (prefix) => multi
  .filter(e => e.file.startsWith(prefix))
  .map(e => `${e.method} ${e.path} ${e.posture}${e.unresolvedReason ? " " + e.unresolvedReason : ""}`)
  .sort();
t.test("multifile: default-imported ESM router gets its mount prefix", () => {
  assertDeepEq(summarizeMulti("routes/users.js"), ["GET /api/users OPEN", "POST /api/users OPEN"]);
});
t.test("multifile: mount middleware guards the routes of an extension-less CJS import", () => {
  assertDeepEq(summarizeMulti("routes/admin.js"), ["DELETE /admin/wipe GUARDED"]);
  const e = multi.find(x => x.file === "routes/admin.js");
  assertEq(e.matchedAuthMarker, "requireAuth");
});
t.test("multifile: ./dir resolves index.js and nested mounts compose across files", () => {
  assertDeepEq(summarizeMulti("routes/api/"), ["GET /v1/items/:id OPEN", "GET /v1/ping OPEN"]);
});
t.test("multifile: named, namespace, renamed and inline require forms; one router mounted twice", () => {
  assertDeepEq(summarizeMulti("multi/"), [
    "GET /a/ping OPEN", "GET /b/ping OPEN", "GET /inline/i OPEN", "GET /ns/n OPEN"
  ]);
});
t.test("multifile: factory export is unresolved mount-prefix-cross-file, never a bare path", () => {
  assertDeepEq(summarizeMulti("routes/legacy.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: dynamic prefix on a cross-file mount stays mount-prefix-not-static", () => {
  assertDeepEq(summarizeMulti("routes/dyn.js"), ["GET null UNKNOWN mount-prefix-not-static"]);
});
t.test("multifile: exported router reached only through an alias import is unresolved", () => {
  assertDeepEq(summarizeMulti("routes/ghost.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: mount cycle is unresolved, not a partial path", () => {
  assertDeepEq(summarizeMulti("cycle/"), [
    "GET null UNKNOWN mount-prefix-cross-file", "GET null UNKNOWN mount-prefix-cross-file"
  ]);
});
t.test("multifile: no unresolved endpoint carries a path", () => {
  for (const e of multiEndpoints) if (e.resolved === false && e.path !== null) throw new Error(`${e.file} has path ${e.path}`);
});
t.test("multifile: scanning a sub-directory never reports half a prefix as resolved", () => {
  const sub = classifyAll(parseExpress(path.join(multiFixture, "routes", "api"), []).endpoints, CONFIG_DEFAULTS)
    .map(e => `${e.file} ${e.method} ${e.path} ${e.unresolvedReason || ""}`).sort();
  assertDeepEq(sub, [
    "index.js GET null mount-prefix-cross-file",
    "items.js GET null mount-prefix-cross-file"
  ]);
});
t.test("multifile: nested local router inside an exported router nothing mounts is unresolved", () => {
  assertDeepEq(summarizeMulti("unmounted/"), [
    "GET null UNKNOWN mount-prefix-cross-file", "GET null UNKNOWN mount-prefix-cross-file"
  ]);
});
t.test("multifile: exported router mounted on an app in its own file keeps its resolved path", () => {
  assertDeepEq(summarizeMulti("samefile/"), ["GET /api/u OPEN"]);
});
t.test("multifile: router mounted in its own file and from another file is unresolved, not stacked", () => {
  assertDeepEq(summarizeMulti("samefile2/server.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: dual-mounted middle router does not stack prefixes onto its child", () => {
  assertDeepEq(summarizeMulti("samefile3/leaf.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: child of a router nested on another local Router() stays unresolved", () => {
  assertDeepEq(summarizeMulti("samefile4/leaf.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: child of an exported router mounted straight on an app resolves with the full prefix", () => {
  assertDeepEq(summarizeMulti("samefile5/leaf.js"), ["GET /api/x/z OPEN"]);
});
t.test("multifile: router on an express() app that is mounted in the same file is unresolved", () => {
  assertDeepEq(summarizeMulti("samefile6/leaf.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.test("multifile: router on an express() app that is mounted from another file is unresolved", () => {
  assertDeepEq(summarizeMulti("samefile7/leaf.js"), ["GET null UNKNOWN mount-prefix-cross-file"]);
});
t.finish();
