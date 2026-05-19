import { diff } from "../lib/drift.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · drift");

function code(method, p, posture = "OPEN") {
  return { framework: "express", method, path: p, file: "s.js", line: 1, resolved: true, posture };
}
function spec(method, p, posture = "GUARDED") {
  return { framework: "openapi", method, path: p, file: "spec.yaml", resolved: true, posture };
}

t.test("shadow: route in code, not in spec", () => {
  const d = diff([code("GET", "/x")], [spec("GET", "/y")]);
  assertEq(d.shadow.length, 1);
  assertEq(d.shadow[0].path, "/x");
});

t.test("stale: route in spec, not in code", () => {
  const d = diff([code("GET", "/x")], [spec("GET", "/y")]);
  assertEq(d.stale.length, 1);
  assertEq(d.stale[0].path, "/y");
});

t.test("authDriftDeclaredOnly: spec guarded, code open", () => {
  const d = diff([code("POST", "/x", "OPEN")], [spec("POST", "/x", "GUARDED")]);
  assertEq(d.authDrift.length, 1);
  assertEq(d.authDrift[0].kind, "authDriftDeclaredOnly");
});

t.test("authDriftCodeOnly: code guarded, spec open", () => {
  const d = diff([code("GET", "/x", "GUARDED")], [spec("GET", "/x", "OPEN")]);
  assertEq(d.authDrift.length, 1);
  assertEq(d.authDrift[0].kind, "authDriftCodeOnly");
});

t.test("path normalization aligns :id ↔ {id}", () => {
  const d = diff([code("GET", "/users/:id", "GUARDED")], [spec("GET", "/users/{id}", "GUARDED")]);
  assertEq(d.shadow.length, 0);
  assertEq(d.stale.length, 0);
  assertEq(d.authDrift.length, 0);
});

t.test("unresolved code endpoints excluded from drift", () => {
  const d = diff(
    [{ framework: "express", method: "GET", path: null, file: "s.js", line: 1, resolved: false, posture: "UNKNOWN" }],
    [spec("GET", "/x")]
  );
  assertEq(d.stale.length, 1);
  assertEq(d.shadow.length, 0);
});

t.finish();
