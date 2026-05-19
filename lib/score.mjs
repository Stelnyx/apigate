/**
 * ApiGate rubric score — 0-100 per rubric, headline = mean of non-null rubrics.
 *
 * Five rubrics, locked at v1:
 *   inventoryResolved — % of discovered routes whose final method+path was
 *                       resolved statically. Unresolved routes drag this down.
 *   authCoverage      — % of (guarded + open) routes that are guarded. UNKNOWNs
 *                       excluded from the denominator. 100 if no endpoints.
 *   openEndpointRisk  — starts at 100. Open write methods (POST/PUT/PATCH/
 *                       DELETE) penalty -12 each; open GETs -3 each. Floor 0.
 *   specDrift         — starts at 100. -5 shadow, -5 stale, -10 authDrift.
 *                       Floor 0. null when no spec exists (omitted from mean).
 *   determinism       — locked at 100 in v0.1. Parsers that emit non-
 *                       deterministic warnings can lower it later. The byte-
 *                       equality test is what actually enforces the contract.
 *
 * Headline = round(mean of all non-null rubrics).
 *
 * Pure functions, frozen weights, no clock, no RNG. Same input → same output.
 */

export const SCORE_VERSION = "v1";

export const RUBRIC_WEIGHTS = Object.freeze({
  openWriteMethod: 12,
  openReadMethod: 3,
  driftShadow: 5,
  driftStale: 5,
  driftAuth: 10
});

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clamp100(n) {
  return Math.max(0, Math.min(100, n));
}

export function inventoryResolved(endpoints) {
  if (!endpoints.length) return 100;
  const resolved = endpoints.filter(e => e.resolved !== false).length;
  return Math.round((100 * resolved) / endpoints.length);
}

export function authCoverage(endpoints) {
  const counted = endpoints.filter(e => e.posture === "GUARDED" || e.posture === "OPEN");
  if (!counted.length) return 100;
  const guarded = counted.filter(e => e.posture === "GUARDED").length;
  return Math.round((100 * guarded) / counted.length);
}

export function openEndpointRisk(endpoints) {
  let score = 100;
  for (const e of endpoints) {
    if (e.posture !== "OPEN") continue;
    const m = String(e.method || "").toUpperCase();
    score -= WRITE_METHODS.has(m) ? RUBRIC_WEIGHTS.openWriteMethod : RUBRIC_WEIGHTS.openReadMethod;
  }
  return clamp100(score);
}

export function specDrift(drift, specPresent) {
  if (!specPresent) return null;
  let score = 100;
  score -= (drift.shadow?.length || 0) * RUBRIC_WEIGHTS.driftShadow;
  score -= (drift.stale?.length || 0) * RUBRIC_WEIGHTS.driftStale;
  score -= (drift.authDrift?.length || 0) * RUBRIC_WEIGHTS.driftAuth;
  return clamp100(score);
}

export const determinism = () => 100;

export function computeScore({ endpoints = [], drift = {}, specPresent = false } = {}) {
  const rubrics = {
    inventoryResolved: inventoryResolved(endpoints),
    authCoverage: authCoverage(endpoints),
    openEndpointRisk: openEndpointRisk(endpoints),
    specDrift: specDrift(drift, specPresent),
    determinism: determinism()
  };
  const present = Object.values(rubrics).filter(v => v !== null);
  const headline = Math.round(present.reduce((a, b) => a + b, 0) / present.length);
  return { headline, rubrics };
}

export function bandFromScore(score) {
  if (score >= 85) return "STRONG";
  if (score >= 70) return "GOOD";
  if (score >= 50) return "MIXED";
  return "WEAK";
}
