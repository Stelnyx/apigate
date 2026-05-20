/**
 * Auth posture classifier.
 *
 *   GUARDED — at least one declared auth identifier appears in the
 *             endpoint's middleware/decorator chain.
 *   OPEN    — endpoint resolved, no auth identifier present.
 *   UNKNOWN — endpoint itself is unresolved, OR (for specs) no security
 *             block is present at the operation or root level.
 *
 * GUARDED endpoints additionally carry `matchedAuthMarker` — the first
 * declared identifier (in deterministic order) that triggered the match.
 * This makes a false-GUARDED reviewable in seconds without changing the
 * trust model: a reviewer can see "matched: validateRequest" and know to
 * tighten `auth.<framework>` in the config.
 *
 * For OpenAPI endpoints the parser pre-derives `declaredPosture`; we honor
 * it here so the orchestrator only sees one posture-field per endpoint.
 */
export function classifyEndpoint(endpoint, config) {
  if (endpoint.framework === "openapi") {
    return {
      ...endpoint,
      posture: endpoint.declaredPosture || "UNKNOWN",
      matchedAuthMarker: null
    };
  }

  if (!endpoint.resolved) {
    return { ...endpoint, posture: "UNKNOWN", matchedAuthMarker: null };
  }

  const identifiers = (config.auth?.[endpoint.framework] || []).map(s => stripDecoratorPrefix(s));
  const markers = (endpoint.authMarkers || []).map(stripDecoratorPrefix);
  const matched = firstMatch(markers, identifiers);
  if (matched !== null) {
    return { ...endpoint, posture: "GUARDED", matchedAuthMarker: matched };
  }
  return { ...endpoint, posture: "OPEN", matchedAuthMarker: null };
}

function firstMatch(markers, identifiers) {
  // Iterate markers in their already-sorted order (parsers sort before
  // emitting). First hit wins → output is deterministic for the same input.
  for (const m of markers) {
    if (identifiers.includes(m)) return m;
    for (const id of identifiers) {
      if (id.includes(".")) {
        const tail = id.split(".").pop();
        if (tail === m) return id;
      }
    }
  }
  return null;
}

function stripDecoratorPrefix(s) {
  return String(s || "").replace(/^@/, "");
}

export function classifyAll(endpoints, config) {
  return endpoints.map(e => classifyEndpoint(e, config));
}
