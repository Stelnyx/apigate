import * as YAML from "yaml";
import { readTextFile, walkFiles, filterFilesByExtension, relPath } from "../utils.mjs";

const EXTS = [".yaml", ".yml", ".json"];
const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "head", "options", "trace"]);

/**
 * Parse OpenAPI 2.0 / 3.x specs statically.
 *
 * A file is considered a spec only when its root has `swagger:` (2.0) or
 * `openapi:` (3.x). Anything else is silently ignored — keeps the parser
 * from mis-identifying random YAML files.
 *
 * Auth: an operation is GUARDED if its `security` block is non-empty OR
 * if a non-empty root `security` covers it. Operation-level `security: []`
 * explicitly removes auth → OPEN. Missing security blocks → UNKNOWN.
 */
export function parseOpenApi(targetDir, excludePaths = [], scanOptions = {}, candidateFiles = null) {
  const files = candidateFiles === null
    ? walkFiles(targetDir, EXTS, excludePaths, scanOptions)
    : filterFilesByExtension(candidateFiles, EXTS);
  const endpoints = [];
  const warnings = [];
  const specsDetected = [];

  for (const file of files) {
    const rel = relPath(targetDir, file);
    const read = readTextFile(file, scanOptions.maxFileBytes);
    if (!read.ok) {
      if (read.skipped?.startsWith("file-too-large")) warnings.push({ file: rel, reason: read.skipped });
      continue;
    }
    const src = read.text;
    if (!/^\s*(swagger\s*:|openapi\s*:|"swagger"\s*:|"openapi"\s*:)/m.test(src) &&
        !looksLikeOasJson(src)) {
      continue;
    }

    let doc;
    try {
      doc = file.endsWith(".json") ? JSON.parse(src) : YAML.parse(src);
    } catch (e) {
      warnings.push({ file: rel, reason: `parse-error: ${e.message}` });
      continue;
    }

    if (!doc || typeof doc !== "object") continue;
    const isOas3 = typeof doc.openapi === "string";
    const isOas2 = typeof doc.swagger === "string";
    if (!isOas3 && !isOas2) continue;

    specsDetected.push(rel);

    const basePath = isOas2 ? (doc.basePath || "") : "";
    const rootSecurity = Array.isArray(doc.security) ? doc.security : null;
    const paths = doc.paths || {};

    for (const rawPath of Object.keys(paths).sort()) {
      const pathItem = paths[rawPath];
      if (!pathItem || typeof pathItem !== "object") continue;
      for (const method of Object.keys(pathItem).sort()) {
        if (!HTTP_METHODS.has(method)) continue;
        const op = pathItem[method];
        if (!op || typeof op !== "object") continue;
        const declaredSecurity = Array.isArray(op.security) ? op.security : null;
        const posture = derivePosture(declaredSecurity, rootSecurity);
        endpoints.push({
          method: method.toUpperCase(),
          path: joinPath(basePath, rawPath),
          file: rel,
          line: null,
          framework: "openapi",
          resolved: true,
          authMarkers: [],
          declaredPosture: posture
        });
      }
    }
  }

  return { endpoints, warnings, specsDetected };
}

function looksLikeOasJson(src) {
  const trimmed = src.trimStart();
  if (!trimmed.startsWith("{")) return false;
  return /"(openapi|swagger)"\s*:/.test(trimmed.slice(0, 1000));
}

function derivePosture(opSec, rootSec) {
  if (opSec === null) {
    if (Array.isArray(rootSec) && rootSec.length > 0) return "GUARDED";
    return "UNKNOWN";
  }
  if (opSec.length === 0) return "OPEN";
  return "GUARDED";
}

function joinPath(base, p) {
  const a = (base || "").replace(/\/$/, "");
  const b = (p || "").replace(/^\/?/, "/");
  return (a + b) || "/";
}
