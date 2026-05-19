// Golden snapshot — locks the end-to-end contract against the sample fixture.
//
// Expected values are inline (not a JSON snapshot file) so any drift surfaces
// as a literal diff in code review. Updating these numbers should always be
// an explicit, justified PR. Same convention as SecGate/test/golden-secgate.mjs.

import path from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "../lib/config.mjs";
import { buildInventory } from "../lib/inventory.mjs";
import { classifyAll } from "../lib/auth.mjs";
import { diff } from "../lib/drift.mjs";
import { computeScore, SCORE_VERSION } from "../lib/score.mjs";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "sample-app");
const t = runner("ApiGate · golden snapshot");

const cfg = loadConfig(fixture);
const inventory = buildInventory(fixture, cfg);
const code = classifyAll(inventory.code, cfg);
const spec = classifyAll(inventory.spec, cfg);
const driftR = diff(code, spec);
const score = computeScore({ endpoints: code, drift: driftR, specPresent: spec.length > 0 });

t.test("SCORE_VERSION pinned at v1", () => assertEq(SCORE_VERSION, "v1"));

t.test("frameworks detected = ['express', 'openapi']", () =>
  assertEq(JSON.stringify(inventory.frameworksDetected), JSON.stringify(["express", "openapi"])));

t.test("code endpoint count = 7 (6 resolved + 1 unresolved dynamic mount)", () =>
  assertEq(code.length, 7));

t.test("resolved code endpoints = 6", () =>
  assertEq(code.filter(e => e.resolved !== false).length, 6));

t.test("guarded code count = 4", () =>
  assertEq(code.filter(e => e.posture === "GUARDED").length, 4));

t.test("open code count = 2 (POST /billing/charge, GET /health)", () =>
  assertEq(code.filter(e => e.posture === "OPEN").length, 2));

t.test("unknown code count = 1 (dynamic mount endpoint)", () =>
  assertEq(code.filter(e => e.posture === "UNKNOWN").length, 1));

t.test("spec endpoint count = 6", () =>
  assertEq(spec.length, 6));

t.test("stale drift = 1 (/legacy/widgets in spec only)", () =>
  assertEq(driftR.stale.length, 1));

t.test("shadow drift = 1 (POST /billing/charge in code, not in spec)", () =>
  assertEq(driftR.shadow.length, 1));

t.test("authDrift contains POST /users/:param (spec guarded, code guarded — should NOT drift)", () => {
  // Negative assertion: spec inherits root security, code has requireAuth → both guarded.
  const m = driftR.authDrift.find(d => d.method === "POST" && d.path === "/users");
  if (m) throw new Error("unexpected authDrift on POST /users");
});

t.test("authDrift on POST /billing/charge (code open, spec absent → no entry)", () => {
  // POST /billing/charge is in code but not in spec → shadow, not auth-drift.
  // Spec lists /billing/invoice/{id} only.
  // The path normalizer aligns no spec entry → shadow.
  const shadowFor = driftR.shadow.find(d => d.path === "/billing/charge");
  if (!shadowFor) {
    // Could also be that spec doesn't declare it at all — that's the shadow case.
    // Our spec only has /billing/invoice/{id}, so /billing/charge is shadow.
    const allShadowPaths = driftR.shadow.map(d => d.path);
    throw new Error(`expected /billing/charge in shadow; got shadow=${JSON.stringify(allShadowPaths)}`);
  }
});

t.test("rubric: inventoryResolved = round(6/7 * 100) = 86", () =>
  assertEq(score.rubrics.inventoryResolved, 86));

t.test("rubric: authCoverage = round(4/7 * 100) = 57 (UNKNOWN in denom)", () =>
  assertEq(score.rubrics.authCoverage, 57));

t.test("rubric: openEndpointRisk = 100 - 12 (POST open) - 3 (GET open) = 85", () =>
  assertEq(score.rubrics.openEndpointRisk, 85));

t.test("rubric: specDrift accounts for 1 stale + 1 shadow", () => {
  // shadow=1 (-5), stale=1 (-5), authDrift=0 → 90
  assertEq(score.rubrics.specDrift, 90);
});

t.test("rubric: determinism = 100", () =>
  assertEq(score.rubrics.determinism, 100));

t.test("headline = round mean(86, 57, 85, 90, 100) = 84", () =>
  assertEq(score.headline, 84));

t.finish();
