import { annotateIntentionalPublic, DEFAULT_PUBLIC_AUTH_PATTERNS } from "../lib/heuristics.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · intentional-public heuristic");

function ep(method, p, extra = {}) {
  return { method, path: p, resolved: true, posture: "OPEN", ...extra };
}

t.test("POST /login flagged intentional-public", () => {
  const [out] = annotateIntentionalPublic([ep("POST", "/login")]);
  assertEq(out.intentionalPublic, true);
});

t.test("POST /auth/signup flagged intentional-public", () => {
  const [out] = annotateIntentionalPublic([ep("POST", "/auth/signup")]);
  assertEq(out.intentionalPublic, true);
});

t.test("GET /health flagged intentional-public", () => {
  const [out] = annotateIntentionalPublic([ep("GET", "/health")]);
  assertEq(out.intentionalPublic, true);
});

t.test("POST /users/:id NOT flagged (writes to a user resource)", () => {
  const [out] = annotateIntentionalPublic([ep("POST", "/users/:id")]);
  assertEq(out.intentionalPublic, false);
});

t.test("POST /billing/charge NOT flagged", () => {
  const [out] = annotateIntentionalPublic([ep("POST", "/billing/charge")]);
  assertEq(out.intentionalPublic, false);
});

t.test("Plain /auth/callback flagged; provider-specific callbacks are user-extended", () => {
  const out = annotateIntentionalPublic([
    ep("GET", "/auth/callback"),
    ep("GET", "/auth/google/callback")
  ]);
  assertEq(out[0].intentionalPublic, true);
  assertEq(out[1].intentionalPublic, false); // user must extend publicAuthPatterns
});

t.test("Empty config patterns disables heuristic (everything false)", () => {
  const [out] = annotateIntentionalPublic([ep("POST", "/login")], []);
  assertEq(out.intentionalPublic, false);
});

t.test("Custom patterns override defaults", () => {
  const out = annotateIntentionalPublic(
    [ep("GET", "/special-public"), ep("POST", "/login")],
    [{ method: "GET", path: "/special-public" }]
  );
  assertEq(out[0].intentionalPublic, true);
  assertEq(out[1].intentionalPublic, false); // login NOT in custom list
});

t.test("Unresolved endpoint never flagged (resolved=false)", () => {
  const [out] = annotateIntentionalPublic([
    { method: "POST", path: null, resolved: false, posture: "UNKNOWN" }
  ]);
  assertEq(out.intentionalPublic, false);
});

t.test("Default pattern list size (sanity)", () => {
  if (DEFAULT_PUBLIC_AUTH_PATTERNS.length < 20) {
    throw new Error(`expected at least 20 default patterns, got ${DEFAULT_PUBLIC_AUTH_PATTERNS.length}`);
  }
});

t.finish();
