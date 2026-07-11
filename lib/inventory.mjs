import { parseExpress } from "./parsers/express.mjs";
import { parseFastify } from "./parsers/fastify.mjs";
import { parseNest } from "./parsers/nest.mjs";
import { parseOpenApi } from "./parsers/openapi.mjs";
import { sortEndpoints, walkFiles } from "./utils.mjs";

const CANDIDATE_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".yaml", ".yml", ".json"];

/**
 * Orchestrate parsers, dedup by (framework, method, path, file, line),
 * return sorted endpoint list + spec list + parser warnings.
 *
 * Code endpoints and spec endpoints stay in separate buckets — they get
 * cross-diffed by lib/drift.mjs, not merged here.
 */
export function buildInventory(targetDir, config) {
  const fw = config.frameworks;
  const excl = config.excludePaths;
  const scan = config.scan || {};

  const code = [];
  const spec = [];
  const warnings = [];
  const frameworksDetected = new Set();
  let specsDetected = [];

  // One bounded, deterministic walk is shared by every enabled parser. Parser
  // entrypoints still walk independently when called directly, preserving the
  // public API used by consumers and focused parser tests.
  const candidateFiles = walkFiles(targetDir, CANDIDATE_EXTENSIONS, excl, scan);

  if (fw.express) {
    const r = parseExpress(targetDir, excl, scan, candidateFiles);
    if (r.endpoints.length) frameworksDetected.add("express");
    code.push(...r.endpoints);
    warnings.push(...r.warnings);
  }
  if (fw.fastify) {
    const r = parseFastify(targetDir, excl, scan, candidateFiles);
    if (r.endpoints.length) frameworksDetected.add("fastify");
    code.push(...r.endpoints);
    warnings.push(...r.warnings);
  }
  if (fw.nest) {
    const r = parseNest(targetDir, excl, scan, candidateFiles);
    if (r.endpoints.length) frameworksDetected.add("nest");
    code.push(...r.endpoints);
    warnings.push(...r.warnings);
  }
  if (fw.openapi) {
    const r = parseOpenApi(targetDir, excl, scan, candidateFiles);
    if (r.endpoints.length) frameworksDetected.add("openapi");
    spec.push(...r.endpoints);
    warnings.push(...r.warnings);
    specsDetected = r.specsDetected || [];
  }

  return {
    code: sortEndpoints(dedup(code)),
    spec: sortEndpoints(dedup(spec)),
    warnings,
    frameworksDetected: [...frameworksDetected].sort(),
    specsDetected: [...specsDetected].sort()
  };
}

function dedup(endpoints) {
  const seen = new Set();
  const out = [];
  for (const e of endpoints) {
    const key = `${e.framework}|${e.method}|${e.path ?? "<unresolved>"}|${e.file ?? ""}|${e.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
