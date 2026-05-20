#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { loadConfig } from "./lib/config.mjs";
import { buildInventory } from "./lib/inventory.mjs";
import { classifyAll } from "./lib/auth.mjs";
import { diff } from "./lib/drift.mjs";
import { computeScore, SCORE_VERSION, bandFromScore } from "./lib/score.mjs";
import { renderHtml, LIMITATIONS } from "./lib/report.mjs";
import { annotateIntentionalPublic, DEFAULT_PUBLIC_AUTH_PATTERNS } from "./lib/heuristics.mjs";
import { resolveGate, parseFailOnFlag } from "./lib/gate.mjs";
import { PARSER_CAPABILITIES, KNOWN_UNRESOLVED_REASONS } from "./lib/capabilities.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));

const argv = process.argv.slice(2);

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
░▒▓█ APIGATE █▓▒░  v${pkg.version}
Static API surface audit — Express · Fastify · NestJS · OpenAPI 2/3

Usage:
  apigate [target] [options]

Arguments:
  target              Directory to scan (default: current directory)

Options:
  --output-dir <dir>  Directory to write report files (default: target)
  --format <fmt>      Output formats: 'json,html' (default), 'json', 'html'
  --fail-on <list>    Comma list, tightens exit-1 policy on top of config.
                      Tokens: open-write, open-read, unknown, drift,
                      intentional-public, missing-spec
  --strip-paths       Relativize target to repo basename. Auto-on when CI=true.
  --deterministic     Make output byte-stable (fixed timestamp, stable sorts)
  --debug             Print parser warnings to stderr
  --version, -v       Print version and exit
  --help, -h          Show this help

Config file (.apigate.config.json in target):
  frameworks         Toggle parsers: { express, fastify, nest, openapi }
  auth               Per-framework auth identifier names
  failOn             Exit-code policy: { openWriteMethods, openReadMethods, unknown, drift, intentionalPublic }
  requireSpec        Exit 1 when no OpenAPI spec is found
  strictPublic       Disable built-in public-auth patterns unless explicitly configured
  excludePaths       Glob list of files to skip
  See .apigate.config.example.json for a fully-commented template.

Exit codes:
  0  PASS — no findings above the configured threshold
  1  FAIL — gate.reasons[] in JSON report explains which gate(s) fired
  2  Invalid target or CLI error

Output:
  apigate-report.json    Machine-readable JSON report (includes gate, parserCapabilities)
  <repo-name>.html       Self-contained HTML report (via @stelnyx/report-theme)

ApiGate makes zero network calls. No code or telemetry leaves the machine.
`);
  process.exit(0);
}

function argValue(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

const rawTarget = argv[0] && !argv[0].startsWith("--") ? argv[0] : ".";
const DEBUG = argv.includes("--debug");
const STRIP_PATHS = argv.includes("--strip-paths") || process.env.CI === "true";
const DETERMINISTIC = argv.includes("--deterministic");
const OUTPUT_DIR_FLAG = argValue("--output-dir");
const FORMAT_RAW = argValue("--format");
const FORMAT_SET = new Set((FORMAT_RAW || "json,html").split(",").map(s => s.trim().toLowerCase()));
const FAIL_ON_FLAG = argValue("--fail-on");

const target = path.resolve(rawTarget);
if (!fs.existsSync(target)) {
  console.error(`Target not found: ${rawTarget}`);
  process.exit(2);
}
if (!fs.statSync(target).isDirectory()) {
  console.error(`Target is not a directory: ${rawTarget}`);
  process.exit(2);
}

const outputDir = OUTPUT_DIR_FLAG ? path.resolve(OUTPUT_DIR_FLAG) : target;
if (OUTPUT_DIR_FLAG && !fs.existsSync(outputDir)) {
  try { fs.mkdirSync(outputDir, { recursive: true }); }
  catch (e) {
    console.error(`Cannot create --output-dir ${outputDir}: ${e.message}`);
    process.exit(2);
  }
}

const repoName = path.basename(path.resolve(target));
const reportTarget = STRIP_PATHS ? repoName : target;

const config = loadConfig(target);

if (FAIL_ON_FLAG !== null) {
  try {
    const { failOn: overrides, requireSpec } = parseFailOnFlag(FAIL_ON_FLAG);
    config.failOn = { ...config.failOn, ...overrides };
    if (requireSpec) config.requireSpec = true;
  } catch (e) {
    console.error(`[apigate] ${e.message}`);
    process.exit(2);
  }
}

console.log(`
░▒▓█ APIGATE v${pkg.version} █▓▒░`);
console.log("Target:", reportTarget);
console.log("Mode:   STATIC");
console.log("────────────────────────────────");

const inventory = buildInventory(target, config);
const patterns = config.publicAuthPatterns ?? (config.strictPublic ? [] : DEFAULT_PUBLIC_AUTH_PATTERNS);
const codeClassified = annotateIntentionalPublic(classifyAll(inventory.code, config), patterns);
const specClassified = annotateIntentionalPublic(classifyAll(inventory.spec, config), patterns);
const driftResult = inventory.spec.length > 0
  ? diff(codeClassified, specClassified)
  : { shadow: [], stale: [], authDrift: [] };

const allEndpoints = [...codeClassified, ...specClassified];
const summary = summarize(codeClassified, specClassified, driftResult);
const { headline, rubrics } = computeScore({
  endpoints: codeClassified,
  drift: driftResult,
  specPresent: inventory.spec.length > 0
});
const gate = resolveGate({
  code: codeClassified,
  drift: driftResult,
  config,
  specPresent: inventory.spec.length > 0
});
const status = gate.status;

const timestamp = process.env.APIGATE_TIMESTAMP
  ? process.env.APIGATE_TIMESTAMP
  : (DETERMINISTIC ? "1970-01-01T00:00:00.000Z" : new Date().toISOString());

const report = {
  version: pkg.version,
  rubricVersion: SCORE_VERSION,
  timestamp,
  target: reportTarget,
  mode: "static",
  status,
  gate,
  headlineScore: headline,
  rubrics,
  summary,
  endpoints: allEndpoints.map(stripInternal),
  drift: driftResult,
  frameworksDetected: inventory.frameworksDetected,
  specsDetected: inventory.specsDetected,
  parserCapabilities: PARSER_CAPABILITIES,
  warnings: inventory.warnings,
  limitations: [...LIMITATIONS]
};

const jsonFile = path.join(outputDir, "apigate-report.json");
const htmlFile = path.join(outputDir, `${repoName}.html`);

if (FORMAT_SET.has("json")) {
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2) + "\n");
}
if (FORMAT_SET.has("html")) {
  fs.writeFileSync(htmlFile, renderHtml(report, repoName));
}

const bar = (() => {
  const filled = Math.round(headline / 5);
  return "█".repeat(filled) + "░".repeat(20 - filled);
})();

console.log(`Headline:  ${headline} / 100   ${bar}   ${bandFromScore(headline)}  rubric ${SCORE_VERSION}`);
console.log("");
for (const [key, val] of Object.entries(rubrics)) {
  const label = ({
    inventoryResolved: "Inventory",
    authCoverage: "Auth Coverage",
    openEndpointRisk: "Open Risk",
    specDrift: "Spec Drift",
    determinism: "Determinism"
  })[key] || key;
  const v = val === null ? "  n/a" : String(val).padStart(5);
  const sub = val === null ? "                    " : "█".repeat(Math.round(val / 5)).padEnd(20, "░");
  console.log(`  ${label.padEnd(14)} ${v} / 100   ${sub}`);
}
console.log("────────────────────────────────");
console.log("STATUS:    ", status);
if (gate.reasons.length) {
  console.log("REASONS:   ", gate.reasons.join(", "));
}
console.log("ENDPOINTS: ", summary.endpoints, ` (${summary.guarded} guarded, ${summary.open} open, ${summary.unknown} unknown, ${summary.intentionalPublic} intentional-public)`);
if (inventory.spec.length > 0) {
  console.log("DRIFT:     ", `${driftResult.shadow.length} shadow, ${driftResult.stale.length} stale, ${driftResult.authDrift.length} auth-drift`);
}
console.log("");

if (DEBUG && inventory.warnings.length) {
  console.error("Parser warnings:");
  for (const w of inventory.warnings) console.error(`  ${w.file}: ${w.reason}`);
}

if (FORMAT_SET.has("json")) console.log("JSON report:", jsonFile);
if (FORMAT_SET.has("html")) console.log("HTML report:", htmlFile);

console.log("");
console.log("Note: static analysis cannot verify runtime authorization (BOLA / object-level access).");
console.log("      See the 'Limitations' section of the report.");

process.exit(status === "PASS" ? 0 : 1);

function summarize(code, spec, drift) {
  const counts = {
    endpoints: code.length,
    resolved: 0,
    unresolved: 0,
    guarded: 0,
    open: 0,
    unknown: 0,
    intentionalPublic: 0,
    specEndpoints: spec.length,
    shadow: drift.shadow?.length || 0,
    stale: drift.stale?.length || 0,
    authDrift: drift.authDrift?.length || 0,
    unknownReasons: {}
  };
  const reasonCounts = {};
  for (const reason of KNOWN_UNRESOLVED_REASONS) reasonCounts[reason] = 0;

  for (const e of code) {
    if (e.resolved === false) {
      counts.unresolved++;
      const reason = e.unresolvedReason || "unspecified";
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    } else {
      counts.resolved++;
    }
    if (e.intentionalPublic) counts.intentionalPublic++;
    if (e.posture === "GUARDED") counts.guarded++;
    else if (e.posture === "OPEN") counts.open++;
    else counts.unknown++;
  }
  // Emit only non-zero buckets, sorted by key for determinism.
  for (const key of Object.keys(reasonCounts).sort()) {
    if (reasonCounts[key] > 0) counts.unknownReasons[key] = reasonCounts[key];
  }
  return counts;
}

function stripInternal(e) {
  const out = { ...e };
  delete out.declaredPosture;
  return out;
}
