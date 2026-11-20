import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { diffEndpoints } from "../lib/diff.mjs";
import { runner, assertEq } from "./_runner.mjs";

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apigate.js");

const t = runner("ApiGate · ref diff (diffEndpoints)");

function ep(method, p, posture, extra = {}) {
  return { method, path: p, posture, resolved: true, ...extra };
}

t.test("added: endpoint in current, not in base", () => {
  const d = diffEndpoints(
    [ep("POST", "/admin/purge", "OPEN", { risk: "HIGH" })],
    []
  );
  assertEq(d.added.length, 1);
  assertEq(d.added[0].method, "POST");
  assertEq(d.added[0].path, "/admin/purge");
  assertEq(d.added[0].posture, "OPEN");
  assertEq(d.added[0].risk, "HIGH");
});

t.test("removed: endpoint in base, not in current", () => {
  const d = diffEndpoints(
    [],
    [ep("GET", "/legacy", "GUARDED")]
  );
  assertEq(d.removed.length, 1);
  assertEq(d.removed[0].path, "/legacy");
});

t.test("changedPosture: GUARDED → OPEN flagged", () => {
  const d = diffEndpoints(
    [ep("PUT", "/users/:id", "OPEN")],
    [ep("PUT", "/users/:id", "GUARDED")]
  );
  assertEq(d.changedPosture.length, 1);
  assertEq(d.changedPosture[0].from, "GUARDED");
  assertEq(d.changedPosture[0].to, "OPEN");
});

t.test("changedRisk: MED → HIGH flagged when risk fields present", () => {
  const d = diffEndpoints(
    [ep("POST", "/billing/charge", "OPEN", { risk: "HIGH" })],
    [ep("POST", "/billing/charge", "OPEN", { risk: "MED" })]
  );
  assertEq(d.changedRisk.length, 1);
  assertEq(d.changedRisk[0].from, "MED");
  assertEq(d.changedRisk[0].to, "HIGH");
});

t.test("path normalization: :id and {id} key-match", () => {
  const d = diffEndpoints(
    [ep("GET", "/users/:id", "GUARDED")],
    [ep("GET", "/users/{id}", "GUARDED")]
  );
  assertEq(d.added.length, 0);
  assertEq(d.removed.length, 0);
  assertEq(d.changedPosture.length, 0);
});

t.test("unresolved endpoints excluded from both sides", () => {
  const d = diffEndpoints(
    [{ method: "GET", path: null, posture: "UNKNOWN", resolved: false }],
    [{ method: "GET", path: null, posture: "UNKNOWN", resolved: false }]
  );
  assertEq(d.added.length, 0);
  assertEq(d.removed.length, 0);
});

t.test("same posture + same risk = no entries", () => {
  const d = diffEndpoints(
    [ep("GET", "/x", "GUARDED", { risk: "LOW" })],
    [ep("GET", "/x", "GUARDED", { risk: "LOW" })]
  );
  assertEq(d.added.length, 0);
  assertEq(d.removed.length, 0);
  assertEq(d.changedPosture.length, 0);
  assertEq(d.changedRisk.length, 0);
});

t.test("results sorted method asc / path asc (deterministic)", () => {
  const d = diffEndpoints(
    [
      ep("POST", "/z", "OPEN"),
      ep("GET",  "/a", "OPEN"),
      ep("POST", "/a", "OPEN")
    ],
    []
  );
  assertEq(d.added.map(x => `${x.method} ${x.path}`).join("|"),
    "GET /a|POST /a|POST /z");
});

t.test("byte-equal across two calls", () => {
  const curr = [ep("POST", "/new", "OPEN", { risk: "HIGH" })];
  const base = [ep("GET", "/old", "GUARDED")];
  const a = JSON.stringify(diffEndpoints(curr, base));
  const b = JSON.stringify(diffEndpoints(curr, base));
  assertEq(a, b);
});

// End-to-end --diff against a real git repo: a new OPEN write that is
// intentional-public (POST /login) must not trip new-open-write; a new OPEN
// write that is not (POST /admin/purge) must.
function diffRun(newRoutes, extraArgs = []) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-diff-gate-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-diff-out-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "x", dependencies: { express: "4.0.0" } }));
  const head = `import express from "express";\nconst app = express();\napp.get("/health", (req, res) => res.send("ok"));\n`;
  fs.writeFileSync(path.join(repo, "app.js"), head);
  git("add", ".");
  git("commit", "-q", "-m", "base");
  fs.writeFileSync(path.join(repo, "app.js"), head + newRoutes);
  const run = spawnSync(process.execPath, [bin, repo, "--format", "json", "--output-dir", out, "--diff", "HEAD", ...extraArgs], {
    encoding: "utf-8",
    timeout: 20000,
    env: { ...process.env, APIGATE_TIMESTAMP: "2026-01-01T00:00:00.000Z" }
  });
  const report = JSON.parse(fs.readFileSync(path.join(out, "apigate-report.json"), "utf-8"));
  return { run, report };
}

t.test("--diff: new intentional-public open write (POST /login) does not trip new-open-write", () => {
  const { run, report } = diffRun(`app.post("/login", (req, res) => res.send("ok"));\n`);
  assertEq(report.refDiff.added.map(x => `${x.method} ${x.path}`).join("|"), "POST /login");
  assertEq(JSON.stringify(report.gate.reasons), "[]");
  assertEq(report.gate.status, "PASS");
  assertEq(run.status, 0);
});

t.test("--diff: new non-public open write (POST /admin/purge) still trips new-open-write", () => {
  const { run, report } = diffRun(`app.post("/admin/purge", (req, res) => res.send("ok"));\n`);
  assertEq(JSON.stringify(report.gate.reasons), JSON.stringify(["new-open-write", "open-write"]));
  assertEq(run.status, 1);
});

t.test("--diff: failOn.intentionalPublic reports intentional-public, not new-open-write", () => {
  const { report } = diffRun(`app.post("/login", (req, res) => res.send("ok"));\n`, ["--fail-on", "intentional-public"]);
  assertEq(JSON.stringify(report.gate.reasons), JSON.stringify(["intentional-public"]));
});

t.finish();
