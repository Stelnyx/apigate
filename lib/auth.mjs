/**
 * Auth posture classifier.
 *
 *   GUARDED — at least one declared auth identifier appears in the
 *             endpoint's middleware/decorator chain.
 *   OPEN    — endpoint resolved, no auth identifier present.
 *   UNKNOWN — endpoint itself is unresolved, OR (for specs) no security
 *             block is present at the operation or root level.
 *
 * For OpenAPI endpoints the parser pre-derives `declaredPosture`; we honor
 * it here so the orchestrator only sees one posture-field per endpoint.
 */
export function classifyEndpoint(endpoint, config) {
  if (endpoint.framework === "openapi") {
    return {
      ...endpoint,
      posture: endpoint.declaredPosture || "UNKNOWN"
    };
  }

  if (!endpoint.resolved) {
    return { ...endpoint, posture: "UNKNOWN" };
  }

  const identifiers = (config.auth?.[endpoint.framework] || []).map(s => stripDecoratorPrefix(s));
  const markers = (endpoint.authMarkers || []).map(stripDecoratorPrefix);
  const hit = markers.some(m => identifiers.includes(m) || matchesDotted(m, identifiers));
  return { ...endpoint, posture: hit ? "GUARDED" : "OPEN" };
}

function stripDecoratorPrefix(s) {
  return String(s || "").replace(/^@/, "");
}

function matchesDotted(marker, identifiers) {
  // Some identifiers are dotted (passport.authenticate). The express parser
  // collects MemberExpression property names into the markers list, so
  // "passport.authenticate" should match if either "passport" or
  // "authenticate" is recorded.
  for (const id of identifiers) {
    if (id.includes(".")) {
      const tail = id.split(".").pop();
      if (tail === marker) return true;
    }
  }
  return false;
}

export function classifyAll(endpoints, config) {
  return endpoints.map(e => classifyEndpoint(e, config));
}
