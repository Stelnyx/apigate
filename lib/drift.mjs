import { normalizePath, normalizeMethod } from "./utils.mjs";

/**
 * Diff code-discovered endpoints against spec-declared endpoints.
 *
 * Match key = (normalized method, normalized path). Unresolved code endpoints
 * are skipped — they can't be matched and would create false drift.
 *
 * Buckets:
 *   shadow                  — in code, not in spec
 *   stale                   — in spec, not in code
 *   authDriftDeclaredOnly   — spec says GUARDED, code says OPEN
 *   authDriftCodeOnly       — code says GUARDED, spec says OPEN or UNKNOWN
 */
export function diff(codeEndpoints, specEndpoints) {
  const codeMap = indexBy(codeEndpoints.filter(e => e.resolved !== false));
  const specMap = indexBy(specEndpoints);

  const shadow = [];
  const stale = [];
  const authDrift = [];

  for (const [key, codeEp] of codeMap.entries()) {
    const specEp = specMap.get(key);
    if (!specEp) {
      shadow.push({
        kind: "shadow",
        method: codeEp.method,
        path: codeEp.path,
        note: `${codeEp.file}${codeEp.line ? `:${codeEp.line}` : ""}`
      });
      continue;
    }
    if (specEp.posture === "GUARDED" && codeEp.posture === "OPEN") {
      authDrift.push({
        kind: "authDriftDeclaredOnly",
        method: codeEp.method,
        path: codeEp.path,
        note: "spec declares auth, code is open"
      });
    } else if (codeEp.posture === "GUARDED" && (specEp.posture === "OPEN" || specEp.posture === "UNKNOWN")) {
      authDrift.push({
        kind: "authDriftCodeOnly",
        method: codeEp.method,
        path: codeEp.path,
        note: `code is guarded, spec is ${specEp.posture.toLowerCase()}`
      });
    }
  }

  for (const [key, specEp] of specMap.entries()) {
    if (!codeMap.has(key)) {
      stale.push({
        kind: "stale",
        method: specEp.method,
        path: specEp.path,
        note: `declared in ${specEp.file}, no matching code route`
      });
    }
  }

  return {
    shadow: sortDriftItems(shadow),
    stale: sortDriftItems(stale),
    authDrift: sortDriftItems(authDrift)
  };
}

function indexBy(endpoints) {
  const map = new Map();
  for (const e of endpoints) {
    const key = `${normalizeMethod(e.method)} ${normalizePath(e.path)}`;
    if (!map.has(key)) map.set(key, e);
  }
  return map;
}

function sortDriftItems(arr) {
  return [...arr].sort((a, b) => {
    if (a.method !== b.method) return a.method < b.method ? -1 : 1;
    if (a.path !== b.path) return (a.path || "") < (b.path || "") ? -1 : 1;
    return (a.kind || "") < (b.kind || "") ? -1 : 1;
  });
}
