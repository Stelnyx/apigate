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

t.finish();
