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
