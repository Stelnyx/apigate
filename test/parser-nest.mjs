import path from "path";
import { fileURLToPath } from "url";
import { parseNest } from "../lib/parsers/nest.mjs";
import { loadConfig, defaultConfig } from "../lib/config.mjs";
import { buildInventory } from "../lib/inventory.mjs";
import { classifyAll } from "../lib/auth.mjs";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "nest-app");

const t = runner("ApiGate · parser-nest");

const { endpoints } = parseNest(fixture, []);

t.test("discovers Controller + Get", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/users/:id");
  if (!e) throw new Error("GET /users/:id missing");
  assertEq(e.framework, "nest");
});

t.test("captures class-level UseGuards as auth marker", () => {
  const e = endpoints.find(x => x.method === "POST" && x.path === "/users");
  if (!e) throw new Error("POST /users missing");
  if (!e.authMarkers.includes("UseGuards")) throw new Error("UseGuards marker missing");
});

t.test("PublicController endpoints have no UseGuards marker", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/public/status");
  if (!e) throw new Error("GET /public/status missing");
  if (e.authMarkers.includes("UseGuards")) throw new Error("PublicController should not inherit UseGuards");
});

t.test("Controller root with subpath joins correctly", () => {
  const e = endpoints.find(x => x.method === "DELETE" && x.path === "/users/:id");
  if (!e) throw new Error("DELETE /users/:id missing");
});

t.test("@Controller({ path, version }) object form resolves the path", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/auth/me");
  if (!e) throw new Error("GET /auth/me from object-form controller missing");
});

t.test("@Controller([...]) array form resolves first path", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/v2/items/:id");
  if (!e) throw new Error("GET /v2/items/:id from array-form controller missing");
});

// v0.3: bidirectional decorator scan — decorators BELOW the @Get/@Post
// anchor must be captured along with decorators above.
const belowFixture = path.join(__dirname, "fixtures", "nest-decorators-below");
const { endpoints: below } = parseNest(belowFixture, []);

t.test("v0.3 bidirectional: @UseGuards BELOW @Get is captured", () => {
  const e = below.find(x => x.method === "GET" && x.path === "/admin/me");
  if (!e) throw new Error("GET /admin/me missing");
  if (!e.authMarkers.includes("UseGuards")) {
    throw new Error(`@UseGuards below @Get not captured. Markers: ${JSON.stringify(e.authMarkers)}`);
  }
});

t.test("v0.3 regression: @UseGuards ABOVE @Get still captured", () => {
  const e = below.find(x => x.method === "GET" && x.path === "/admin/super");
  if (!e) throw new Error("GET /admin/super missing");
  if (!e.authMarkers.includes("UseGuards")) throw new Error("@UseGuards above @Get must still be captured");
});

t.test("v0.3 bidirectional: mixed above + below captures both directions", () => {
  const e = below.find(x => x.method === "POST" && x.path === "/admin/audit");
  if (!e) throw new Error("POST /admin/audit missing");
  if (!e.authMarkers.includes("UseGuards")) throw new Error("UseGuards (below @Post) missing");
  if (!e.authMarkers.includes("Roles")) throw new Error("Roles (above @Post) missing");
});

t.test("v0.3 bidirectional: markers stay sorted + deduped", () => {
  const e = below.find(x => x.method === "POST" && x.path === "/admin/audit");
  const sorted = [...e.authMarkers].sort();
  if (JSON.stringify(e.authMarkers) !== JSON.stringify(sorted)) {
    throw new Error(`markers not sorted: ${JSON.stringify(e.authMarkers)}`);
  }
  if (new Set(e.authMarkers).size !== e.authMarkers.length) {
    throw new Error(`markers not deduped: ${JSON.stringify(e.authMarkers)}`);
  }
});

// Global guards, setGlobalPrefix and publicDecorators.
const fx = name => path.join(__dirname, "fixtures", name);
const find = (eps, method, p) => eps.find(x => x.method === method && x.path === p);
const globalEps = parseNest(fx("nest-global"), []).endpoints;
const edgeEps = parseNest(fx("nest-global-edge"), []).endpoints;
t.test("global: APP_GUARD useClass adds the guard marker and setGlobalPrefix applies", () => {
  const e = find(globalEps, "GET", "/api/users");
  if (!e) throw new Error(`GET /api/users missing: ${JSON.stringify(globalEps.map(x => x.path))}`);
  if (!e.authMarkers.includes("JwtAuthGuard")) throw new Error("JwtAuthGuard marker missing");
  if (!find(globalEps, "POST", "/api/users")) throw new Error("POST /api/users missing");
});
t.test("global: @Public method does not receive the global guard marker", () => {
  const e = find(globalEps, "GET", "/api/users/health");
  if (!e) throw new Error("GET /api/users/health missing");
  assertEq(e.authMarkers.includes("JwtAuthGuard"), false);
});
t.test("global: useExisting (any key order) and useGlobalGuards(new X()) both detected, comments ignored", () => {
  const e = find(edgeEps, "GET", "/v1/items");
  if (!e) throw new Error(`GET /v1/items missing: ${JSON.stringify(edgeEps.map(x => x.path))}`);
  assertEq(JSON.stringify(e.authMarkers), JSON.stringify(["JwtAuthGuard", "OrgGuard"]));
});
t.test("global: class-level public decorator cancels the global guard for the whole controller", () => {
  const e = find(edgeEps, "GET", "/v1/open/info");
  if (!e) throw new Error("GET /v1/open/info missing");
  assertEq(JSON.stringify(e.authMarkers), JSON.stringify(["SkipAuth"]));
});
t.test("global: explicit @UseGuards next to @Public is kept, global markers are not added", () => {
  const e = find(edgeEps, "POST", "/v1/items");
  if (!e) throw new Error("POST /v1/items missing");
  assertEq(JSON.stringify(e.authMarkers), JSON.stringify(["Public", "UseGuards"]));
});
t.test("global: literal exclude array skips the prefix (string and { path } forms)", () => {
  if (!find(edgeEps, "GET", "/status")) throw new Error("/status should not be prefixed");
  if (!find(edgeEps, "GET", "/ping")) throw new Error("/ping should not be prefixed");
});
t.test("global: publicDecorators option overrides the default list", () => {
  const eps = parseNest(fx("nest-global"), [], {}, null, { publicDecorators: [] }).endpoints;
  const e = find(eps, "GET", "/api/users/health");
  assertEq(e.authMarkers.includes("JwtAuthGuard"), true);
});
t.test("global: non-literal setGlobalPrefix leaves endpoints unresolved with a known reason", () => {
  const eps = parseNest(fx("nest-global-nonliteral"), []).endpoints;
  assertEq(eps.length, 1);
  assertEq(eps[0].resolved, false);
  assertEq(eps[0].path, null);
  assertEq(eps[0].unresolvedReason, "global-prefix-not-static-string");
});
t.test("global: end to end, acceptance postures with default config", () => {
  const dir = fx("nest-global");
  const cls = classifyAll(buildInventory(dir, loadConfig(dir)).code, loadConfig(dir));
  const post = (m, p) => cls.find(x => x.method === m && x.path === p)?.posture;
  assertEq(post("GET", "/api/users"), "GUARDED");
  assertEq(post("POST", "/api/users"), "GUARDED");
  assertEq(post("GET", "/api/users/health"), "OPEN");
});
t.test("global: a guard whose name matches no auth.nest marker stays OPEN", () => {
  const dir = fx("nest-global-orgonly");
  const cfg = defaultConfig();
  const cls = classifyAll(buildInventory(dir, cfg).code, cfg);
  assertEq(cls[0].posture, "OPEN");
});
t.test("nest: trailing comment on the anchor line keeps the decorators below it", () => {
  const e = find(edgeEps, "GET", "/v1/notes/:id");
  if (!e) throw new Error("GET /v1/notes/:id missing");
  assertEq(e.authMarkers.includes("UseGuards"), true);
});
t.finish();
