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

t.finish();
