import path from "path";
import { fileURLToPath } from "url";
import { parseOpenApi } from "../lib/parsers/openapi.mjs";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "sample-app");

const t = runner("ApiGate · parser-openapi");

const { endpoints, specsDetected } = parseOpenApi(fixture, ["node_modules/**"]);

t.test("detects the spec file", () => {
  if (!specsDetected.includes("openapi.yaml")) throw new Error("openapi.yaml not detected");
});

t.test("operation security: [] → OPEN", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/health");
  if (!e) throw new Error("/health missing");
  assertEq(e.declaredPosture, "OPEN");
});

t.test("root security inherited → GUARDED", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/users/{id}");
  if (!e) throw new Error("/users/{id} missing");
  assertEq(e.declaredPosture, "GUARDED");
});

t.test("supports OAS 2.0 swagger root", async () => {
  const fs = await import("fs");
  const os = await import("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-oas2-"));
  fs.writeFileSync(path.join(dir, "swagger.yaml"),
    "swagger: '2.0'\ninfo:\n  title: Old\n  version: '1.0'\nbasePath: /v1\npaths:\n  /things:\n    get:\n      responses:\n        '200':\n          description: ok\n");
  const r = parseOpenApi(dir, []);
  const e = r.endpoints.find(x => x.method === "GET" && x.path === "/v1/things");
  if (!e) throw new Error("OAS 2.0 basePath join failed");
});

t.finish();
