import path from "path";
import fs from "fs";
import os from "os";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bin = path.join(root, "apigate.js");
const t = runner("ApiGate · gates");

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apigate-gates-"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function runApiGate(dir) {
  return spawnSync(process.execPath, [bin, dir, "--format", "json"], {
    encoding: "utf-8",
    env: { ...process.env, APIGATE_TIMESTAMP: "2026-01-01T00:00:00.000Z" }
  });
}

t.test("failOn.unknown fails unresolved endpoints", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "app.js"), `
    import express from "express";
    const app = express();
    const route = "/dynamic";
    app.get(route, handler);
  `);
  writeJson(path.join(dir, ".apigate.config.json"), {
    failOn: { unknown: true }
  });

  const run = runApiGate(dir);
  assertEq(run.status, 1);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "apigate-report.json"), "utf-8"));
  assertEq(report.status, "FAIL");
  assertEq(report.summary.unknown, 1);
});

t.test("requireSpec fails when no OpenAPI spec is detected", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "app.js"), `
    import express from "express";
    const app = express();
    app.get("/health", handler);
  `);
  writeJson(path.join(dir, ".apigate.config.json"), {
    requireSpec: true
  });

  const run = runApiGate(dir);
  assertEq(run.status, 1);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "apigate-report.json"), "utf-8"));
  assertEq(report.status, "FAIL");
  assertEq(report.specsDetected.length, 0);
});

t.test("strictPublic disables built-in public patterns", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "app.js"), `
    import express from "express";
    const app = express();
    app.post("/login", handler);
  `);
  writeJson(path.join(dir, ".apigate.config.json"), {
    strictPublic: true
  });

  const run = runApiGate(dir);
  assertEq(run.status, 1);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "apigate-report.json"), "utf-8"));
  assertEq(report.summary.intentionalPublic, 0);
});

function runCli(dir, extra = []) {
  return spawnSync(process.execPath, [bin, dir, "--format", "json", ...extra], {
    encoding: "utf-8",
    env: { ...process.env, APIGATE_TIMESTAMP: "2026-01-01T00:00:00.000Z" }
  });
}
function readReport(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "apigate-report.json"), "utf-8"));
}
t.test("empty directory: null scores, n/a in stdout, exit 0", () => {
  const dir = makeDir();
  const run = runCli(dir);
  assertEq(run.status, 0);
  const report = readReport(dir);
  assertEq(report.headlineScore, null);
  for (const v of Object.values(report.rubrics)) assertEq(v, null);
  if (!run.stdout.includes("n/a")) throw new Error("stdout should contain n/a");
  if (run.stdout.includes("STRONG") || run.stdout.includes("100 / 100")) {
    throw new Error("stdout must not claim a score for an empty scan");
  }
});
t.test("empty directory: NOTHING_ANALYSED, not PASS, and stdout names the supported frameworks", () => {
  const dir = makeDir();
  const run = runCli(dir);
  assertEq(run.status, 0);
  assertEq(readReport(dir).status, "NOTHING_ANALYSED");
  if (/STATUS:\s+PASS/.test(run.stdout)) throw new Error("stdout must not print PASS for an empty scan");
  for (const name of ["Express", "Fastify", "NestJS", "OpenAPI"]) {
    if (!run.stdout.includes(name)) throw new Error(`stdout should name ${name}`);
  }
});
t.test("only an unsupported framework (FastAPI): NOTHING_ANALYSED, not PASS", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "main.py"), [
    "from fastapi import FastAPI",
    "app = FastAPI()",
    "",
    "@app.get(\"/items/{item_id}\")",
    "def read_item(item_id: int):",
    "    return {\"item_id\": item_id}",
    ""
  ].join("\n"));
  const run = runCli(dir);
  assertEq(run.status, 0);
  assertEq(readReport(dir).status, "NOTHING_ANALYSED");
  if (/STATUS:\s+PASS/.test(run.stdout)) throw new Error("stdout must not print PASS");
});
// documenso (Hono) gave two "express" endpoints and PASS: `app.get(...)` is
// also Hono syntax, and nothing in that repository uses Express.
t.test("only an unsupported JS framework (Hono app.get in .ts and .js): NOTHING_ANALYSED, not PASS", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "router.ts"), [
    "import { Hono } from 'hono';",
    "const app = new Hono();",
    "app.get(`/api/v2/openapi.json`, (c) => c.json(openApiDocument));",
    "app.route(`/api/v2`, downloadRoute);",
    "export default app;",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "health.js"), [
    "import { Hono } from 'hono';",
    "export const router = new Hono();",
    "router.get('/health', (c) => c.text('ok'));",
    ""
  ].join("\n"));
  writeJson(path.join(dir, "package.json"), { name: "hono-app", dependencies: { hono: "4.6.0" } });
  const run = runCli(dir);
  assertEq(run.status, 0);
  const rep = readReport(dir);
  assertEq(rep.status, "NOTHING_ANALYSED");
  assertEq(rep.endpoints.length, 0);
  assertEq(JSON.stringify(rep.frameworksDetected), "[]");
  if (/STATUS:\s+PASS/.test(run.stdout)) throw new Error("stdout must not print PASS");
});
t.test("an express import inside a comment does not make a Hono app Express", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "router.ts"), [
    "import { Hono } from 'hono';",
    "// was: import express from 'express';",
    "/* const express = require(\"express\"); */",
    "const app = new Hono();",
    "app.get('/health', (c) => c.text('ok'));",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "jobs.js"), [
    "import { Hono } from 'hono';",
    "// import 'express'",
    "export const router = new Hono();",
    "router.get('/jobs', (c) => c.json([]));",
    ""
  ].join("\n"));
  const run = runCli(dir);
  assertEq(run.status, 0);
  const rep = readReport(dir);
  assertEq(rep.status, "NOTHING_ANALYSED");
  assertEq(rep.endpoints.length, 0);
});
t.test("require(`express`) with a template literal counts as Express", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "app.js"), "const express = require(`express`);\nconst app = express();\napp.get('/items', requireAuth, listItems);\n");
  const run = runCli(dir);
  assertEq(run.status, 0);
  const rep = readReport(dir);
  assertEq(rep.status, "PASS");
  assertEq(rep.endpoints.length, 1);
});
t.test("express declared only in package.json: a router received as a parameter still counts", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "routes.js"), "module.exports = (app) => {\n  app.get('/items', requireAuth, listItems);\n};\n");
  writeJson(path.join(dir, "package.json"), { name: "express-app", dependencies: { express: "4.21.2" } });
  const run = runCli(dir);
  assertEq(run.status, 0);
  const rep = readReport(dir);
  assertEq(rep.status, "PASS");
  assertEq(rep.endpoints.length, 1);
  assertEq(JSON.stringify(rep.frameworksDetected), JSON.stringify(["express"]));
});
t.test("express imported in another scanned file: a router received as a parameter still counts", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "server.ts"), "import express from 'express';\nexport const server = express();\n");
  fs.writeFileSync(path.join(dir, "items.ts"), "export default (router) => {\n  router.get('/items', requireAuth, listItems);\n};\n");
  const run = runCli(dir);
  assertEq(run.status, 0);
  const rep = readReport(dir);
  assertEq(rep.status, "PASS");
  assertEq(rep.endpoints.length, 1);
  assertEq(JSON.stringify(rep.frameworksDetected), JSON.stringify(["express"]));
});
t.test("empty directory: --fail-on empty exits 1 with no-endpoints", () => {
  const dir = makeDir();
  const run = runCli(dir, ["--fail-on", "empty"]);
  assertEq(run.status, 1);
  assertEq(JSON.stringify(readReport(dir).gate.reasons), JSON.stringify(["no-endpoints"]));
});
t.test("fastify dependency with no routes: warning names the framework", () => {
  const dir = makeDir();
  writeJson(path.join(dir, "package.json"), { name: "x", dependencies: { fastify: "^4.0.0" } });
  const run = runCli(dir);
  assertEq(run.status, 0);
  const report = readReport(dir);
  assertEq(JSON.stringify(report.warnings), JSON.stringify([
    { file: "package.json", reason: "framework-detected-no-endpoints", framework: "fastify" }
  ]));
  if (!/WARNING:.*fastify/.test(run.stdout)) throw new Error("stdout should name fastify in a WARNING line");
});
t.test("@nestjs dependency with no routes maps to framework nest", () => {
  const dir = makeDir();
  writeJson(path.join(dir, "package.json"), { devDependencies: { "@nestjs/core": "^10.0.0" } });
  runCli(dir);
  assertEq(readReport(dir).warnings[0].framework, "nest");
});
t.test("fastify TypeScript fixture: scored, three endpoints, no warning", () => {
  const out = makeDir();
  const run = spawnSync(process.execPath, [bin, path.join(root, "test", "fixtures", "fastify-ts"), "--format", "json", "--output-dir", out], {
    encoding: "utf-8",
    env: { ...process.env, APIGATE_TIMESTAMP: "2026-01-01T00:00:00.000Z" }
  });
  const report = readReport(out);
  assertEq(report.summary.endpoints, 3);
  assertEq(typeof report.headlineScore, "number");
  assertEq(report.warnings.length, 0);
  if (run.stdout.includes("ENDPOINTS:  0")) throw new Error("fixture must not report 0 endpoints");
});
t.finish();
