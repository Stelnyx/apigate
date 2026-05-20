import { resolveGate, parseFailOnFlag, GATE_REASONS } from "../lib/gate.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · gate (resolveGate + parseFailOnFlag)");

const defaultFailOn = {
  openWriteMethods: true,
  openReadMethods: false,
  unknown: false,
  drift: false,
  intentionalPublic: false
};

function cfg(overrides = {}) {
  return {
    failOn: { ...defaultFailOn, ...(overrides.failOn || {}) },
    requireSpec: overrides.requireSpec || false
  };
}

t.test("GATE_REASONS enum is sorted, deduped, frozen", () => {
  const sorted = [...GATE_REASONS].sort();
  assertEq(JSON.stringify(GATE_REASONS), JSON.stringify(sorted));
  assertEq(new Set(GATE_REASONS).size, GATE_REASONS.length);
  try { GATE_REASONS.push("x"); } catch (e) { return; }
  throw new Error("GATE_REASONS should be frozen");
});

t.test("PASS when no findings", () => {
  const r = resolveGate({
    code: [{ posture: "GUARDED", method: "GET" }],
    drift: {},
    config: cfg(),
    specPresent: false
  });
  assertEq(r.status, "PASS");
  assertEq(r.reasons.length, 0);
});

t.test("open-write reason fires for OPEN POST", () => {
  const r = resolveGate({
    code: [{ posture: "OPEN", method: "POST" }],
    drift: {},
    config: cfg(),
    specPresent: false
  });
  assertEq(r.status, "FAIL");
  assertEq(JSON.stringify(r.reasons), JSON.stringify(["open-write"]));
});

t.test("open-read reason gated behind failOn.openReadMethods", () => {
  const a = resolveGate({
    code: [{ posture: "OPEN", method: "GET" }],
    drift: {},
    config: cfg(),
    specPresent: false
  });
  assertEq(a.status, "PASS");

  const b = resolveGate({
    code: [{ posture: "OPEN", method: "GET" }],
    drift: {},
    config: cfg({ failOn: { openReadMethods: true } }),
    specPresent: false
  });
  assertEq(b.status, "FAIL");
  assertEq(JSON.stringify(b.reasons), JSON.stringify(["open-read"]));
});

t.test("unknown-endpoint reason fires only when failOn.unknown", () => {
  const a = resolveGate({
    code: [{ posture: "UNKNOWN" }],
    drift: {},
    config: cfg(),
    specPresent: false
  });
  assertEq(a.status, "PASS");

  const b = resolveGate({
    code: [{ posture: "UNKNOWN" }],
    drift: {},
    config: cfg({ failOn: { unknown: true } }),
    specPresent: false
  });
  assertEq(JSON.stringify(b.reasons), JSON.stringify(["unknown-endpoint"]));
});

t.test("missing-spec reason fires when requireSpec and no spec", () => {
  const r = resolveGate({
    code: [],
    drift: {},
    config: cfg({ requireSpec: true }),
    specPresent: false
  });
  assertEq(JSON.stringify(r.reasons), JSON.stringify(["missing-spec"]));
});

t.test("drift reason fires only when failOn.drift", () => {
  const r = resolveGate({
    code: [],
    drift: { shadow: [1], stale: [], authDrift: [] },
    config: cfg({ failOn: { drift: true } }),
    specPresent: true
  });
  assertEq(JSON.stringify(r.reasons), JSON.stringify(["drift"]));
});

t.test("intentional-public reason fires only when failOn.intentionalPublic", () => {
  const ep = { posture: "OPEN", method: "POST", intentionalPublic: true };
  const a = resolveGate({ code: [ep], drift: {}, config: cfg(), specPresent: false });
  assertEq(a.status, "PASS");

  // intentional-public endpoints emit ONE reason (intentional-public) — not
  // also open-write. Reviewers should see the precise category that fired.
  const b = resolveGate({
    code: [ep],
    drift: {},
    config: cfg({ failOn: { intentionalPublic: true } }),
    specPresent: false
  });
  assertEq(JSON.stringify(b.reasons), JSON.stringify(["intentional-public"]));
});

t.test("reasons sorted lexicographically and deduplicated", () => {
  const r = resolveGate({
    code: [
      { posture: "OPEN", method: "POST" },
      { posture: "OPEN", method: "POST" },
      { posture: "UNKNOWN" }
    ],
    drift: { shadow: [1] },
    config: cfg({ failOn: { drift: true, unknown: true } }),
    specPresent: true
  });
  assertEq(JSON.stringify(r.reasons), JSON.stringify(["drift", "open-write", "unknown-endpoint"]));
});

t.test("parseFailOnFlag: empty/null returns no overrides", () => {
  const a = parseFailOnFlag(null);
  assertEq(JSON.stringify(a.failOn), "{}");
  const b = parseFailOnFlag("");
  assertEq(JSON.stringify(b.failOn), "{}");
});

t.test("parseFailOnFlag: known tokens map to failOn keys", () => {
  const r = parseFailOnFlag("open-write,unknown,drift,intentional-public");
  assertEq(JSON.stringify(r.failOn), JSON.stringify({
    openWriteMethods: true,
    unknown: true,
    drift: true,
    intentionalPublic: true
  }));
});

t.test("parseFailOnFlag: missing-spec sets requireSpec", () => {
  const r = parseFailOnFlag("missing-spec");
  assertEq(r.requireSpec, true);
  assertEq(JSON.stringify(r.failOn), "{}");
});

t.test("parseFailOnFlag: unknown token throws (no silent ignore)", () => {
  try {
    parseFailOnFlag("open-write,oops");
  } catch (e) {
    if (!e.message.includes('"oops"')) throw new Error(`expected error to mention token, got: ${e.message}`);
    return;
  }
  throw new Error("expected parseFailOnFlag to throw on unknown token");
});

t.finish();
