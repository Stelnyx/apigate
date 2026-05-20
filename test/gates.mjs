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

t.finish();
