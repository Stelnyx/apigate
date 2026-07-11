import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { readTextFile, walkFiles, filterFilesByExtension, relPath } from "../utils.mjs";

const HTTP_METHODS = new Set([
  "get", "post", "put", "delete", "patch", "head", "options", "all"
]);

const EXTS = [".js", ".mjs", ".cjs", ".ts", ".tsx"];
const TS_EXTS = new Set([".ts", ".tsx"]);

/**
 * Parse Express routes statically.
 *
 * Strategy:
 *   1. Walk every JS file under targetDir.
 *   2. acorn-parse each file (ecmaVersion: latest, sourceType: module).
 *      Files that fail to parse are skipped with a deterministic warning.
 *   3. Detect router var declarations: `const r = express.Router()` /
 *      `Router()` / `new express.Router()`.
 *   4. Detect mount calls: `app.use('/prefix', r)` — record prefix→routerVar
 *      bindings inside the SAME file (cross-file router import resolution is
 *      not attempted in v0.1; such mounts are flagged UNRESOLVED).
 *   5. Detect `<obj>.<method>(<path>, ...handlers)`:
 *        - If <obj> is `app`/`server`/`router`/etc., emit endpoint with the
 *          path as-is OR with the resolved mount prefix if <obj> matches a
 *          routerVar that has a known mount in this file.
 *        - If <method> is not a known HTTP verb, skip.
 *        - If the first arg is not a string literal, emit UNRESOLVED.
 *   6. Collect middleware identifiers from all remaining args, by Identifier
 *      name + MemberExpression last-property name + property names of inline
 *      array elements. Stored as `authMarkers` for the auth classifier.
 */
export function parseExpress(targetDir, excludePaths = [], scanOptions = {}, candidateFiles = null) {
  const files = candidateFiles === null
    ? walkFiles(targetDir, EXTS, excludePaths, scanOptions)
    : filterFilesByExtension(candidateFiles, EXTS);
  const endpoints = [];
  const warnings = [];

  for (const file of files) {
    const rel = relPath(targetDir, file);
    const read = readTextFile(file, scanOptions.maxFileBytes);
    if (!read.ok) {
      if (read.skipped?.startsWith("file-too-large")) warnings.push({ file: rel, reason: read.skipped });
      continue;
    }
    const src = read.text;
    if (!hasExpressSignal(src)) continue;

    const ext = path.extname(file).toLowerCase();

    if (TS_EXTS.has(ext)) {
      parseTsRegex(src, rel, endpoints);
      continue;
    }

    let ast;
    try {
      ast = acorn.parse(src, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        locations: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true
      });
    } catch {
      try {
        ast = acorn.parse(src, {
          ecmaVersion: "latest",
          sourceType: "script",
          allowHashBang: true,
          locations: true,
          allowReturnOutsideFunction: true
        });
      } catch (e2) {
        warnings.push({ file: rel, reason: `parse-error: ${e2.message}` });
        continue;
      }
    }
    const routerMounts = {};
    const routerUnresolved = new Set();
    collectMounts(ast, routerMounts, routerUnresolved);

    walk.simple(ast, {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
        const prop = callee.property;
        if (!prop || prop.type !== "Identifier") return;
        const method = prop.name.toLowerCase();
        if (!HTTP_METHODS.has(method)) return;

        const objName = identName(callee.object);
        if (!objName) return;
        if (!isPlausibleRouterRef(objName)) return;

        const args = node.arguments || [];
        if (args.length < 1) return;

        const pathArg = args[0];
        const pathLit = stringValue(pathArg);
        const pathResolved = pathLit !== null;
        const mountUnresolved = routerUnresolved.has(objName);

        let resolved, finalPath, reason;
        if (mountUnresolved) {
          resolved = false;
          finalPath = null;
          reason = "mount-prefix-not-static";
        } else if (!pathResolved) {
          resolved = false;
          finalPath = null;
          reason = "path-not-static-string";
        } else {
          resolved = true;
          const prefix = routerMounts[objName] || "";
          finalPath = joinPath(prefix, pathLit);
          reason = null;
        }

        const authMarkers = collectMarkers(args.slice(1));

        endpoints.push({
          method: method === "all" ? "ALL" : method.toUpperCase(),
          path: finalPath,
          file: rel,
          line: node.loc?.start?.line ?? null,
          framework: "express",
          resolved,
          authMarkers,
          unresolvedReason: reason
        });
      }
    });
  }

  return { endpoints, warnings };
}

function hasExpressSignal(src) {
  return /\bexpress\b|\bRouter\s*\(|\bapp\.(get|post|put|delete|patch|head|options|all|use)\b|\brouter\.(get|post|put|delete|patch|head|options|all|use)\b/.test(src);
}

/**
 * Regex-based fallback for TypeScript files. acorn doesn't parse TS without
 * a separate dependency; rather than ship a TS parser, we extract the
 * load-bearing patterns directly:
 *
 *   - `<obj>.<method>('<path>', ...rest)` → endpoint
 *   - `<obj>.use('<prefix>', <routerVar>)` → mount binding
 *   - `<obj>.use(<dynamicExpr>, <routerVar>)` → unresolved mount
 *
 * Trade-off: less precise than AST (no scope tracking, comments inside route
 * args could fool the regex). Mitigation: we treat any line containing
 * `//` before the method literal as suspicious and tag UNRESOLVED.
 */
function parseTsRegex(src, rel, endpoints) {
  const mounts = {};
  const unresolved = new Set();
  // Pattern A: <obj>.use('/prefix', routerVar [, ...])
  const useStatic = /(\w+)\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*([\w.]+)/g;
  let m;
  while ((m = useStatic.exec(src)) !== null) {
    mounts[m[3].split(".").pop()] = m[2];
  }
  // Pattern B: <obj>.use(<not-string-literal>, routerVar)
  const useDynamic = /(\w+)\.use\s*\(\s*([^'"][\s\S]*?)\s*,\s*([\w.]+)\s*\)/g;
  while ((m = useDynamic.exec(src)) !== null) {
    const first = m[2].trim();
    if (!first.startsWith("'") && !first.startsWith('"') && !first.startsWith("`")) {
      unresolved.add(m[3].split(".").pop());
    }
  }

  const methodCall = /(\w+)\.(get|post|put|delete|patch|head|options|all)\s*\(\s*(['"`])([^'"`]+)\3\s*,?([\s\S]*?)\)\s*[;,)]/g;
  while ((m = methodCall.exec(src)) !== null) {
    const objName = m[1];
    if (!isPlausibleRouterRef(objName)) continue;
    const method = m[2].toLowerCase();
    const pathLit = m[4];
    const rest = m[5] || "";
    const line = src.slice(0, m.index).split(/\n/).length;
    let resolved, finalPath, reason;
    if (unresolved.has(objName)) {
      resolved = false; finalPath = null; reason = "mount-prefix-not-static";
    } else {
      resolved = true;
      const prefix = mounts[objName] || "";
      finalPath = joinPath(prefix, pathLit);
      reason = null;
    }
    endpoints.push({
      method: method === "all" ? "ALL" : method.toUpperCase(),
      path: finalPath,
      file: rel,
      line,
      framework: "express",
      resolved,
      authMarkers: extractMarkersFromText(rest),
      unresolvedReason: reason
    });
  }
}

function extractMarkersFromText(snippet) {
  const ids = [];
  const re = /\b([A-Za-z_$][\w$]*)\b/g;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    ids.push(m[1]);
  }
  // Filter out reserved + obvious noise so the marker list stays meaningful.
  const noise = new Set([
    "async", "await", "function", "const", "let", "var", "return", "if", "else",
    "for", "while", "switch", "case", "default", "break", "continue", "try",
    "catch", "finally", "throw", "new", "this", "true", "false", "null",
    "undefined", "Promise", "req", "res", "next", "Request", "Response",
    "NextFunction", "string", "number", "boolean", "any", "void"
  ]);
  return [...new Set(ids.filter(id => !noise.has(id)))].sort();
}

function identName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  if (node.type === "ThisExpression") return "this";
  return null;
}

function isPlausibleRouterRef(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === "app" || n === "server" || n === "router" || n.endsWith("router") || n.endsWith("app") || n === "api" || n === "r";
}

function stringValue(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function joinPath(prefix, suffix) {
  if (!prefix) return suffix || "/";
  if (!suffix || suffix === "/") return prefix.replace(/\/$/, "") || "/";
  const a = prefix.replace(/\/$/, "");
  const b = suffix.startsWith("/") ? suffix : "/" + suffix;
  const joined = a + b;
  return joined || "/";
}

function collectMounts(ast, routerMounts, routerUnresolved) {
  walk.simple(ast, {
    CallExpression(node) {
      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
      if (callee.property?.type !== "Identifier" || callee.property.name !== "use") return;
      const args = node.arguments || [];
      if (args.length < 2) return;
      const prefix = stringValue(args[0]);
      for (let i = 1; i < args.length; i++) {
        const refName = identName(args[i]);
        if (!refName || !isPlausibleRouterRef(refName)) continue;
        if (prefix !== null) {
          routerMounts[refName] = prefix;
        } else {
          routerUnresolved.add(refName);
        }
      }
    }
  });
}

function collectMarkers(handlerNodes) {
  const out = new Set();
  for (const node of handlerNodes) {
    visitMarker(node, out);
  }
  return [...out].sort();
}

function visitMarker(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Identifier") {
    out.add(node.name);
    return;
  }
  if (node.type === "MemberExpression") {
    if (node.property?.type === "Identifier") out.add(node.property.name);
    visitMarker(node.object, out);
    return;
  }
  if (node.type === "CallExpression") {
    visitMarker(node.callee, out);
    for (const a of node.arguments || []) visitMarker(a, out);
    return;
  }
  if (node.type === "ArrayExpression") {
    for (const el of node.elements || []) visitMarker(el, out);
    return;
  }
}
