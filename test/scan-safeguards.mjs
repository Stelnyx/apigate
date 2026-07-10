import path from "path";
import fs from "fs";
import os from "os";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { runner, assertEq, assertIncludes, assertNotIncludes } from "./_runner.mjs";

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

t.finish();
