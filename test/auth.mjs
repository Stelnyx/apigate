import { classifyEndpoint } from "../lib/auth.mjs";
import { defaultConfig } from "../lib/config.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · auth classifier");
const cfg = defaultConfig();

t.test("Express endpoint with requireAuth marker → GUARDED", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: "/x", resolved: true, authMarkers: ["requireAuth"] },
    cfg
  );
  assertEq(e.posture, "GUARDED");
});

t.test("Express endpoint with no markers → OPEN", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "POST", path: "/x", resolved: true, authMarkers: [] },
    cfg
  );
  assertEq(e.posture, "OPEN");
});

t.test("NestJS endpoint whose only auth-looking decorator is from @nestjs/swagger → OPEN", () => {
  // @ApiBearerAuth() and its siblings only describe the OpenAPI document.
  for (const marker of ["ApiBearerAuth", "ApiCookieAuth", "ApiSecurity", "ApiOAuth2", "ApiBasicAuth"]) {
    const e = classifyEndpoint(
      { framework: "nest", method: "GET", path: "/profiles/:username", resolved: true, authMarkers: [marker, "Controller", "Get"] },
      cfg
    );
    assertEq(e.posture, "OPEN", marker);
  }
});
t.test("NestJS endpoint with @UseGuards next to @ApiBearerAuth → GUARDED by UseGuards", () => {
  const e = classifyEndpoint(
    { framework: "nest", method: "GET", path: "/me", resolved: true, authMarkers: ["ApiBearerAuth", "Controller", "Get", "UseGuards"] },
    cfg
  );
  assertEq(e.posture, "GUARDED");
  assertEq(e.matchedAuthMarker, "UseGuards");
});
t.test("Unresolved endpoint → UNKNOWN", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: null, resolved: false, authMarkers: [] },
    cfg
  );
  assertEq(e.posture, "UNKNOWN");
});

t.test("Dotted identifier (passport.authenticate) matched by tail", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: "/x", resolved: true, authMarkers: ["authenticate"] },
    cfg
  );
  assertEq(e.posture, "GUARDED");
});

t.test("Nest UseGuards marker → GUARDED", () => {
  const e = classifyEndpoint(
    { framework: "nest", method: "GET", path: "/x", resolved: true, authMarkers: ["UseGuards"] },
    cfg
  );
  assertEq(e.posture, "GUARDED");
});

t.test("OpenAPI passes through declaredPosture", () => {
  const e = classifyEndpoint(
    { framework: "openapi", method: "GET", path: "/x", resolved: true, declaredPosture: "OPEN", authMarkers: [] },
    cfg
  );
  assertEq(e.posture, "OPEN");
});

t.test("matchedAuthMarker echoes first matching identifier (Express)", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: "/x", resolved: true, authMarkers: ["requireAuth"] },
    cfg
  );
  assertEq(e.matchedAuthMarker, "requireAuth");
});

t.test("matchedAuthMarker is the dotted identifier when no exact match exists", () => {
  const customCfg = { auth: { express: ["passport.authenticate"] } };
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: "/x", resolved: true, authMarkers: ["authenticate"] },
    customCfg
  );
  assertEq(e.matchedAuthMarker, "passport.authenticate");
});

t.test("matchedAuthMarker prefers exact match over dotted tail", () => {
  // Default config has both "authenticate" and "passport.authenticate".
  // Exact-match wins so the reviewer sees the canonical identifier.
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: "/x", resolved: true, authMarkers: ["authenticate"] },
    cfg
  );
  assertEq(e.matchedAuthMarker, "authenticate");
});

t.test("matchedAuthMarker is null for OPEN endpoints", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "POST", path: "/x", resolved: true, authMarkers: [] },
    cfg
  );
  assertEq(e.matchedAuthMarker, null);
});

t.test("matchedAuthMarker is null for UNKNOWN endpoints", () => {
  const e = classifyEndpoint(
    { framework: "express", method: "GET", path: null, resolved: false, authMarkers: [] },
    cfg
  );
  assertEq(e.matchedAuthMarker, null);
});

t.test("matchedAuthMarker is null for OpenAPI endpoints (no markers concept)", () => {
  const e = classifyEndpoint(
    { framework: "openapi", method: "GET", path: "/x", resolved: true, declaredPosture: "GUARDED", authMarkers: [] },
    cfg
  );
  assertEq(e.matchedAuthMarker, null);
});

t.finish();
