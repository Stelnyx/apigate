// report-theme contract — locks the rule that ApiGate consumes
// @stelnyx/report-theme as its sole HTML renderer. If a future change
// introduces a parallel HTML emitter or fork of the theme, these
// assertions catch it.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderHtml } from "../lib/report.mjs";
import { PARSER_CAPABILITIES } from "../lib/capabilities.mjs";
import { runner, assertEq, assertIncludes } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const t = runner("ApiGate · report-theme contract");

const sampleReport = {
  version: "0.1.0",
  rubricVersion: "v1",
  timestamp: "2026-01-01T00:00:00.000Z",
  target: "sample",
  mode: "static",
  status: "FAIL",
  gate: { status: "FAIL", reasons: ["open-write", "unknown-endpoint"] },
  headlineScore: 92,
  rubrics: {
    inventoryResolved: 100,
    authCoverage: 88,
    openEndpointRisk: 92,
    specDrift: 95,
    determinism: 100
  },
  summary: {
    endpoints: 10, resolved: 9, unresolved: 1,
    guarded: 8, open: 1, unknown: 1, intentionalPublic: 0,
    specEndpoints: 10, shadow: 0, stale: 0, authDrift: 0,
    unknownReasons: { "path-not-static-string": 1 }
  },
  endpoints: [
    { method: "GET", path: "/health", file: "s.js", line: 1, framework: "express", resolved: true, authMarkers: [], posture: "OPEN", matchedAuthMarker: null },
    { method: "GET", path: "/me", file: "s.js", line: 2, framework: "express", resolved: true, authMarkers: ["requireAuth"], posture: "GUARDED", matchedAuthMarker: "requireAuth" }
  ],
  drift: { shadow: [], stale: [], authDrift: [] },
  frameworksDetected: ["express"],
  specsDetected: ["openapi.yaml"],
  parserCapabilities: PARSER_CAPABILITIES,
  warnings: [],
  limitations: ["whatever"]
};

const html = renderHtml(sampleReport, "sample");

t.test("output is from @stelnyx/report-theme shell (class=\"shell\")", () =>
  assertIncludes(html, 'class="shell"'));

t.test("contains <aside class=\"aside\"> (theme sidebar)", () =>
  assertIncludes(html, '<aside class="aside">'));

t.test("contains <main class=\"main\"> (theme main slot)", () =>
  assertIncludes(html, '<main class="main">'));

t.test("contains exactly one <!doctype html> (no parallel renderer)", () => {
  const matches = html.match(/<!doctype html>/gi) || [];
  assertEq(matches.length, 1, "exactly one doctype");
});

t.test("report-theme css var --surface is used (no orphan tokens)", () =>
  assertIncludes(html, "--surface"));

t.test("limitations section is rendered", () =>
  assertIncludes(html, "What this does NOT prove"));

t.test("APIGATE brand passed to themeShell", () =>
  assertIncludes(html, "ApiGate Report"));

t.test("gate.reasons rendered as section + nav", () => {
  assertIncludes(html, "Gate reasons");
  assertIncludes(html, "open-write");
  assertIncludes(html, "unknown-endpoint");
});

t.test("parser capabilities section embedded", () => {
  assertIncludes(html, "Parser capabilities");
  assertIncludes(html, "sameFileMountPrefix");
});

t.test("matchedAuthMarker rendered for GUARDED endpoint", () => {
  assertIncludes(html, "requireAuth");
});

t.test("unknownReasons section appears when non-empty", () => {
  assertIncludes(html, "Unknown reasons");
  assertIncludes(html, "path-not-static-string");
});

t.test("local-only lib/report.mjs does NOT include verbatim <!doctype in source", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "report.mjs"), "utf-8");
  if (/<!doctype/i.test(src)) {
    throw new Error("lib/report.mjs contains <!doctype literal — must come from @stelnyx/report-theme only");
  }
});

t.finish();
