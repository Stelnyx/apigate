import path from "path";
import { fileURLToPath } from "url";
import { parseExpress } from "../lib/parsers/express.mjs";
import { runner, assertEq } from "./_runner.mjs";

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

t.finish();
