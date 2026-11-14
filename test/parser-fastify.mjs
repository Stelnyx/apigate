import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { parseFastify } from "../lib/parsers/fastify.mjs";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, "fixtures", "fastify-app");

const t = runner("ApiGate · parser-fastify");

const { endpoints } = parseFastify(fixture, []);

t.test("discovers fastify.get", () => {
  const e = endpoints.find(x => x.method === "GET" && x.path === "/ping");
  if (!e) throw new Error("GET /ping missing");
  assertEq(e.framework, "fastify");
});

t.test("discovers fastify.route({method,url}) form", () => {
  const e = endpoints.find(x => x.method === "POST" && x.path === "/items");
  if (!e) throw new Error("POST /items via fastify.route missing");
});

t.test("captures preHandler markers", () => {
  const e = endpoints.find(x => x.method === "POST" && x.path === "/items");
  if (!e.authMarkers.includes("verifyJWT")) throw new Error("verifyJWT marker missing on POST /items");
});

t.test("discovers DELETE with opts object", () => {
  const e = endpoints.find(x => x.method === "DELETE" && x.path === "/items/:id");
  if (!e) throw new Error("DELETE /items/:id missing");
  if (!e.authMarkers.includes("verifyJWT")) throw new Error("verifyJWT marker missing on DELETE");
});

const tsFixture = path.join(__dirname, "fixtures", "fastify-ts");
const ts = parseFastify(tsFixture, []).endpoints;
t.test("fastify-ts fixture yields exactly the three routes", () => {
  const got = ts.map(e => `${e.method} ${e.path}`).sort();
  assertEq(JSON.stringify(got), JSON.stringify(["DELETE /orders/:id", "GET /health", "POST /orders"]));
  for (const e of ts) {
    assertEq(e.framework, "fastify");
    assertEq(e.resolved, true);
  }
});
function tsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-fastify-ts-"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
t.test("TS: preHandler markers survive an arrow body with parens", () => {
  const dir = tsDir({ "a.ts": `import Fastify from "fastify";
const app = Fastify();
app.post<{ Body: { a: number } }>("/x", { preHandler: [verifyJWT, requireRole("admin")] }, async () => ({ ok: true }));
` });
  const e = parseFastify(dir, []).endpoints.find(x => x.path === "/x");
  if (!e) throw new Error("POST /x missing");
  assertEq(e.method, "POST");
  for (const m of ["verifyJWT", "requireRole"]) {
    if (!e.authMarkers.includes(m)) throw new Error(`marker ${m} missing: ${e.authMarkers}`);
  }
});
t.test("TS: .mts and .cts are parsed", () => {
  const dir = tsDir({
    "a.mts": `import Fastify from "fastify";\nconst app = Fastify();\napp.get("/m", async () => 1);\n`,
    "b.cts": `import Fastify from "fastify";\nconst app = Fastify();\napp.get("/c", async () => 1);\n`
  });
  const got = parseFastify(dir, []).endpoints.map(e => e.path).sort();
  assertEq(JSON.stringify(got), JSON.stringify(["/c", "/m"]));
});
t.test("TS: file without a fastify signal is ignored", () => {
  const dir = tsDir({ "a.ts": `const app = makeThing();\napp.get("/nope", () => 1);\n` });
  assertEq(parseFastify(dir, []).endpoints.length, 0);
});
t.test("TS: route({...}) reads method and url", () => {
  const dir = tsDir({ "a.ts": `import Fastify from "fastify";
const app = Fastify();
app.route({ method: "PUT", url: "/r/:id", preHandler: [verifyJWT], handler: async () => ({}) });
` });
  const e = parseFastify(dir, []).endpoints.find(x => x.path === "/r/:id");
  if (!e) throw new Error("PUT /r/:id missing");
  assertEq(e.method, "PUT");
  assertEq(e.resolved, true);
  if (!e.authMarkers.includes("verifyJWT")) throw new Error("verifyJWT missing");
});
t.test("TS: route({...}) without url stays unresolved", () => {
  const dir = tsDir({ "a.ts": `import Fastify from "fastify";
const app = Fastify();
app.route({ method: "GET", handler: async () => ({}) });
` });
  const e = parseFastify(dir, []).endpoints[0];
  assertEq(e.resolved, false);
  assertEq(e.unresolvedReason, "method-or-url-missing");
});
t.test("TS: route({ method: [..] }) uses the first method", () => {
  const dir = tsDir({ "a.ts": `import Fastify from "fastify";\nconst app = Fastify();\napp.route({ method: ["PATCH", "PUT"], url: "/arr", handler });\n` });
  const e = parseFastify(dir, []).endpoints[0];
  assertEq(e.method, "PATCH");
  assertEq(e.path, "/arr");
});
t.finish();
