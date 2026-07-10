import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { readTextFile, walkFiles, relPath } from "../utils.mjs";

const HTTP_METHODS = new Set([
  "get", "post", "put", "delete", "patch", "head", "options", "all"
]);

const EXTS = [".js", ".mjs", ".cjs"];

/**
 * Parse Fastify routes statically.
 *
 * Patterns:
 *   - fastify.<method>('/path', opts, handler)
 *   - fastify.route({ method: 'GET', url: '/path', preHandler: [auth], handler })
 *   - fastify.register(plugin, { prefix: '/api/v1' }) — prefix bindings are
 *     not propagated across files in v0.1; declared here for future use.
 */
export function parseFastify(targetDir, excludePaths = [], scanOptions = {}) {
  const files = walkFiles(targetDir, EXTS, excludePaths, scanOptions);
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
    if (!/\bfastify\b|\bFastify\b|require\(['"]fastify['"]\)|from\s+['"]fastify['"]/.test(src)) continue;

    let ast;
    try {
      ast = acorn.parse(src, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        locations: true
      });
    } catch {
      try {
        ast = acorn.parse(src, {
          ecmaVersion: "latest",
          sourceType: "script",
          allowHashBang: true,
          locations: true
        });
      } catch (e2) {
        warnings.push({ file: rel, reason: `parse-error: ${e2.message}` });
        continue;
      }
    }

    walk.simple(ast, {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee) return;

        if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
          const method = callee.property.name.toLowerCase();
          const objName = identName(callee.object);

          if (HTTP_METHODS.has(method) && isPlausibleFastify(objName)) {
            handleMethodCall(node, method, rel, endpoints);
            return;
          }

          if (method === "route" && isPlausibleFastify(objName)) {
            handleRouteCall(node, rel, endpoints);
            return;
          }
        }
      }
    });
  }

  return { endpoints, warnings };
}

function handleMethodCall(node, method, rel, endpoints) {
  const args = node.arguments || [];
  if (!args.length) return;
  const pathLit = stringValue(args[0]);
  const resolved = pathLit !== null;
  const restArgs = args.slice(1);

  const optsMarkers = [];
  for (const a of restArgs) {
    if (a?.type === "ObjectExpression") {
      collectFastifyOpts(a, optsMarkers);
    } else {
      collectIdentifiers(a, optsMarkers);
    }
  }

  endpoints.push({
    method: method === "all" ? "ALL" : method.toUpperCase(),
    path: resolved ? pathLit : null,
    file: rel,
    line: node.loc?.start?.line ?? null,
    framework: "fastify",
    resolved,
    authMarkers: dedupSorted(optsMarkers),
    unresolvedReason: resolved ? null : "path-not-static-string"
  });
}

function handleRouteCall(node, rel, endpoints) {
  const args = node.arguments || [];
  const opts = args[0];
  if (!opts || opts.type !== "ObjectExpression") {
    endpoints.push({
      method: "UNKNOWN",
      path: null,
      file: rel,
      line: node.loc?.start?.line ?? null,
      framework: "fastify",
      resolved: false,
      authMarkers: [],
      unresolvedReason: "route-opts-not-object-literal"
    });
    return;
  }
  let method = null;
  let url = null;
  const markers = [];
  for (const prop of opts.properties || []) {
    if (prop.type !== "Property" || prop.computed) continue;
    const key = propKey(prop);
    if (!key) continue;
    if (key === "method") method = stringValue(prop.value) || methodArrayValue(prop.value);
    else if (key === "url" || key === "path") url = stringValue(prop.value);
    else collectIdentifiers(prop.value, markers);
    if (key === "preHandler" || key === "onRequest" || key === "preValidation" || key === "preParsing") {
      collectIdentifiers(prop.value, markers);
    }
  }
  const resolved = !!(method && url);
  endpoints.push({
    method: method ? String(method).toUpperCase() : "UNKNOWN",
    path: url,
    file: rel,
    line: node.loc?.start?.line ?? null,
    framework: "fastify",
    resolved,
    authMarkers: dedupSorted(markers),
    unresolvedReason: resolved ? null : "method-or-url-missing"
  });
}

function isPlausibleFastify(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === "fastify" || n === "app" || n === "server" || n === "instance" || n.endsWith("fastify");
}

function identName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

function stringValue(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function methodArrayValue(node) {
  if (node?.type !== "ArrayExpression") return null;
  const first = node.elements?.[0];
  return stringValue(first);
}

function propKey(prop) {
  if (prop.key?.type === "Identifier") return prop.key.name;
  if (prop.key?.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;
  return null;
}

function collectFastifyOpts(obj, markers) {
  for (const prop of obj.properties || []) {
    if (prop.type !== "Property" || prop.computed) continue;
    const key = propKey(prop);
    if (key === "preHandler" || key === "onRequest" || key === "preValidation" || key === "preParsing" || key === "config" || key === "schema") {
      collectIdentifiers(prop.value, markers);
    }
  }
}

function collectIdentifiers(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Identifier") { out.push(node.name); return; }
  if (node.type === "MemberExpression") {
    if (node.property?.type === "Identifier") out.push(node.property.name);
    collectIdentifiers(node.object, out);
    return;
  }
  if (node.type === "CallExpression") {
    collectIdentifiers(node.callee, out);
    for (const a of node.arguments || []) collectIdentifiers(a, out);
    return;
  }
  if (node.type === "ArrayExpression") {
    for (const el of node.elements || []) collectIdentifiers(el, out);
    return;
  }
  if (node.type === "ObjectExpression") {
    for (const p of node.properties || []) if (p.type === "Property") collectIdentifiers(p.value, out);
    return;
  }
}

function dedupSorted(arr) {
  return [...new Set(arr)].sort();
}
