import {
  computeScore, inventoryResolved, authCoverage,
  openEndpointRisk, specDrift, bandFromScore, SCORE_VERSION
} from "../lib/score.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · score");

t.test("SCORE_VERSION pinned at v1", () => assertEq(SCORE_VERSION, "v1"));

t.test("inventoryResolved: 100 when no endpoints", () =>
  assertEq(inventoryResolved([]), 100));

t.test("inventoryResolved: 80 when 4/5 resolved", () =>
  assertEq(inventoryResolved([
    { resolved: true }, { resolved: true }, { resolved: true }, { resolved: true }, { resolved: false }
  ]), 80));

t.test("authCoverage: 100 when none counted", () =>
  assertEq(authCoverage([{ posture: "UNKNOWN" }]), 100));

t.test("authCoverage: 50 when 1/2 guarded", () =>
  assertEq(authCoverage([{ posture: "GUARDED" }, { posture: "OPEN" }]), 50));

t.test("openEndpointRisk: write methods -12 each", () => {
  const eps = [
    { posture: "OPEN", method: "POST" },
    { posture: "OPEN", method: "DELETE" }
  ];
  assertEq(openEndpointRisk(eps), 100 - 24);
});

t.test("openEndpointRisk: read methods -3 each", () => {
  const eps = [{ posture: "OPEN", method: "GET" }, { posture: "OPEN", method: "GET" }];
  assertEq(openEndpointRisk(eps), 94);
});

t.test("openEndpointRisk: floor 0", () => {
  const eps = Array.from({ length: 20 }, () => ({ posture: "OPEN", method: "POST" }));
  assertEq(openEndpointRisk(eps), 0);
});

t.test("specDrift: null when no spec", () =>
  assertEq(specDrift({ shadow: [], stale: [], authDrift: [] }, false), null));

t.test("specDrift: 80 with 4 stale only", () =>
  assertEq(specDrift({ shadow: [], stale: [1, 2, 3, 4], authDrift: [] }, true), 80));

t.test("specDrift: 75 with 1 shadow + 2 authDrift", () =>
  assertEq(specDrift({ shadow: [1], stale: [], authDrift: [1, 2] }, true), 75));

t.test("computeScore: headline = mean of non-null rubrics", () => {
  const eps = [
    { resolved: true, posture: "GUARDED", method: "GET" },
    { resolved: true, posture: "GUARDED", method: "POST" }
  ];
  const r = computeScore({ endpoints: eps, drift: { shadow: [], stale: [], authDrift: [] }, specPresent: false });
  assertEq(r.headline, 100);
  assertEq(r.rubrics.specDrift, null);
});

t.test("computeScore: spec present → drift included in mean", () => {
  const eps = [{ resolved: true, posture: "OPEN", method: "POST" }];
  const r = computeScore({
    endpoints: eps,
    drift: { shadow: [1], stale: [], authDrift: [] },
    specPresent: true
  });
  // inventoryResolved=100, authCoverage=0, openEndpointRisk=88, specDrift=95, determinism=100
  // mean = (100 + 0 + 88 + 95 + 100)/5 = 76.6 → 77
  assertEq(r.headline, 77);
});

t.test("band: STRONG ≥ 85, GOOD ≥ 70, MIXED ≥ 50, WEAK < 50", () => {
  assertEq(bandFromScore(99), "STRONG");
  assertEq(bandFromScore(85), "STRONG");
  assertEq(bandFromScore(84), "GOOD");
  assertEq(bandFromScore(70), "GOOD");
  assertEq(bandFromScore(50), "MIXED");
  assertEq(bandFromScore(49), "WEAK");
});

t.finish();
