import path from "path";
import { fileURLToPath } from "url";
import { parseNest } from "../lib/parsers/nest.mjs";
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

t.finish();
