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

t.finish();
