import path from "path";
import fs from "fs";
import os from "os";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { runner, assertEq, assertDeepEq, assertIncludes, assertNotIncludes } from "./_runner.mjs";
import { buildInventory } from "../lib/inventory.mjs";
import { loadConfig } from "../lib/config.mjs";
import { parseExpress } from "../lib/parsers/express.mjs";
import { parseFastify } from "../lib/parsers/fastify.mjs";
import { parseNest } from "../lib/parsers/nest.mjs";
import { parseOpenApi } from "../lib/parsers/openapi.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bin = path.join(root, "apigate.js");
const t = runner("ApiGate · scan safeguards");

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apigate-scan-"));
}

function runApiGate(dir, args = []) {
  return spawnSync(process.execPath, [bin, dir, "--format", "json", ...args], {
    encoding: "utf-8",
    timeout: 5000,
    env: { ...process.env, APIGATE_TIMESTAMP: "2026-01-01T00:00:00.000Z" }
  });
}

function makeProject(dir, index) {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "ignored-package"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `project-${index}` }));
  fs.writeFileSync(path.join(dir, "app.js"), `
    import express from "express";
    const app = express();
    app.get("/project-${index}/health", handler);
  `);
  fs.writeFileSync(path.join(dir, "node_modules", "ignored-package", "routes.js"), `
    import express from "express";
    const app = express();
    app.post("/ignored-${index}", handler);
  `);
}

t.test("multi-project workspace fails fast with a clear message", () => {
  const dir = makeDir();
  for (let i = 1; i <= 3; i++) makeProject(path.join(dir, `project-${i}`), i);

  const run = runApiGate(dir);
  assertEq(run.status, 2);
  assertIncludes(run.stderr, "looks like a workspace with 3 sub-projects");
  assertIncludes(run.stderr, "point ApiGate at a single project");
  assertEq(run.error, undefined);
});

t.test("allow-workspace completes and still excludes nested vendor trees", () => {
  const dir = makeDir();
  for (let i = 1; i <= 3; i++) makeProject(path.join(dir, `project-${i}`), i);
  try {
    fs.symlinkSync(dir, path.join(dir, "project-1", "cycle"), "dir");
  } catch {
    // Some platforms or filesystems disallow symlinks; the bounded-walk
    // coverage above still exercises the large-workspace path.
  }

  const run = runApiGate(dir, ["--allow-workspace", "--max-files", "1000", "--max-depth", "8"]);
  assertEq(run.error, undefined);
  assertEq(run.status, 0);
  assertNotIncludes(run.stderr + run.stdout, "ignored-1");
  const report = JSON.parse(fs.readFileSync(path.join(dir, "apigate-report.json"), "utf-8"));
  assertEq(report.summary.endpoints, 3);
});

t.test("max-files limit exits clearly instead of hanging", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "single-project" }));
  for (let i = 0; i < 8; i++) {
    fs.writeFileSync(path.join(dir, `file-${i}.js`), "export const x = 1;\n");
  }

  const run = runApiGate(dir, ["--max-files", "3"]);
  assertEq(run.status, 2);
  assertIncludes(run.stderr, "scan exceeded max files (3)");
  assertNotIncludes(run.stderr, "Error:");
});

t.test("inventory performs one candidate walk for all enabled parsers", () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "single-walk" }));
  fs.writeFileSync(path.join(dir, "app.js"), "import express from 'express'; const app = express(); app.get('/ok', handler);\n");
  fs.writeFileSync(path.join(dir, "controller.ts"), "@Controller('users') class Users { @Get(':id') one() {} }\n");
  fs.writeFileSync(path.join(dir, "openapi.yaml"), "openapi: 3.0.0\npaths: {}\n");

  const config = loadConfig(dir);
  let progressCalls = 0;
  config.scan = { ...config.scan, progressEvery: 1, onProgress: () => { progressCalls++; } };
  const inventory = buildInventory(dir, config);

  assertEq(progressCalls, 4, "one progress event per visited file, not per parser");
  assertDeepEq(inventory.code.map(e => `${e.framework}:${e.method}:${e.path}`).sort(), [
    "express:GET:/ok",
    "nest:GET:/users/:id"
  ]);
});

t.test("shared index preserves endpoint keys on framework fixtures", () => {
  const cases = [
    ["express", path.join(root, "test/fixtures/realworld-express"), parseExpress, "code"],
    ["fastify", path.join(root, "test/fixtures/fastify-app"), parseFastify, "code"],
    ["nest", path.join(root, "test/fixtures/nest-app"), parseNest, "code"],
    ["openapi", path.join(root, "test/fixtures/sample-app"), parseOpenApi, "spec"]
  ];
  const keys = endpoints => endpoints.map(e =>
    `${e.framework}|${e.method}|${e.path ?? "<unresolved>"}|${e.file ?? ""}|${e.line ?? ""}`
  ).sort();

  for (const [framework, fixture, parser, bucket] of cases) {
    const config = loadConfig(fixture);
    config.frameworks = { express: false, fastify: false, nest: false, openapi: false, [framework]: true };
    const legacyKeys = keys(parser(fixture, config.excludePaths, config.scan).endpoints);
    const sharedKeys = keys(buildInventory(fixture, config)[bucket]);
    assertDeepEq(sharedKeys, legacyKeys, `${framework} endpoint keys`);
  }
});

t.finish();
