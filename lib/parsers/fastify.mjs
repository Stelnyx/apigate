import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { readTextFile, walkFiles, filterFilesByExtension, relPath } from "../utils.mjs";

const HTTP_METHODS = new Set([
  "get", "post", "put", "delete", "patch", "head", "options", "all"
]);

const EXTS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"];
const TS_EXTS = new Set([".ts", ".mts", ".cts"]);
const MAX_CALL_CHARS = 20000;
const MAX_GENERIC_CHARS = 1000;

/**
 * Parse Fastify routes statically.
 *
 * Patterns:
 *   - fastify.<method>('/path', opts, handler)
 *   - fastify.route({ method: 'GET', url: '/path', preHandler: [auth], handler })
 *   - fastify.register(plugin, { prefix: '/api/v1' }) — prefix bindings are
 *     not propagated across files in v0.1; declared here for future use.
 *
 * .js/.mjs/.cjs are parsed with acorn. .ts/.mts/.cts use a bounded, string-
 * and comment-aware text scanner (no TypeScript dependency): it reads the
 * same patterns, including a generic argument after the method name such as
 * fastify.delete<{ Params: { id: string } }>('/x', handler).
 */
export function parseFastify(targetDir, excludePaths = [], scanOptions = {}, candidateFiles = null) {
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
    if (!/\bfastify\b|\bFastify\b|require\(['"]fastify['"]\)|from\s+['"]fastify['"]/.test(src)) continue;

    if (TS_EXTS.has(path.extname(file).toLowerCase())) {
      parseTsRegex(src, rel, endpoints);
      continue;
    }

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

const TS_CALL_RE = /([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|delete|patch|head|options|all|route)\s*(?=[<(])/g;
const MARKER_KEYS = new Set(["preHandler", "onRequest", "preValidation", "preParsing", "config", "schema"]);
const MARKER_NOISE = new Set([
  "async", "await", "function", "const", "let", "var", "return", "new", "this",
  "true", "false", "null", "undefined", "typeof", "as"
]);

function parseTsRegex(src, rel, endpoints) {
  const masked = maskLiterals(src);
  TS_CALL_RE.lastIndex = 0;
  let m;
  while ((m = TS_CALL_RE.exec(masked)) !== null) {
    const objName = m[1];
    const method = m[2];
    if (!isPlausibleFastify(objName)) continue;
    let i = m.index + m[0].length;
    if (masked[i] === "<") {
      i = skipGeneric(masked, i);
      if (i === -1) continue;
      while (/\s/.test(masked[i] || "")) i++;
      if (masked[i] !== "(") continue;
    }
    const end = matchClose(masked, i, "(", ")", MAX_CALL_CHARS);
    if (end === -1) continue;
    const line = lineAt(src, m.index);
    const args = splitTopLevel(masked, i + 1, end).map(([a, b]) => ({ raw: src.slice(a, b), code: masked.slice(a, b) }));
    if (method === "route") tsRoute(args[0], rel, line, endpoints);
    else tsMethod(method, args, rel, line, endpoints);
    TS_CALL_RE.lastIndex = end + 1;
  }
}

function tsMethod(method, args, rel, line, endpoints) {
  if (!args.length) return;
  const pathLit = literalString(args[0]);
  const markers = [];
  for (const a of args.slice(1)) {
    if (a.code.trim().startsWith("{")) {
      for (const prop of objectProps(a)) {
        if (MARKER_KEYS.has(prop.key)) pushIdentifiers(prop.code, markers);
      }
    } else if (!isFunctionText(a.code)) {
      pushIdentifiers(a.code, markers);
    }
  }
  endpoints.push({
    method: method === "all" ? "ALL" : method.toUpperCase(),
    path: pathLit,
    file: rel,
    line,
    framework: "fastify",
    resolved: pathLit !== null,
    authMarkers: dedupSorted(markers),
    unresolvedReason: pathLit !== null ? null : "path-not-static-string"
  });
}

function tsRoute(opts, rel, line, endpoints) {
  if (!opts || !opts.code.trim().startsWith("{")) {
    endpoints.push({
      method: "UNKNOWN", path: null, file: rel, line, framework: "fastify",
      resolved: false, authMarkers: [], unresolvedReason: "route-opts-not-object-literal"
    });
    return;
  }
  let method = null;
  let url = null;
  const markers = [];
  for (const prop of objectProps(opts)) {
    if (prop.key === "method") {
      method = literalString(prop) ?? firstArrayString(prop);
    } else if (prop.key === "url" || prop.key === "path") {
      url = literalString(prop);
    } else if (!isFunctionText(prop.code)) {
      pushIdentifiers(prop.code, markers);
    }
  }
  const resolved = !!(method && url);
  endpoints.push({
    method: method ? String(method).toUpperCase() : "UNKNOWN",
    path: url,
    file: rel,
    line,
    framework: "fastify",
    resolved,
    authMarkers: dedupSorted(markers),
    unresolvedReason: resolved ? null : "method-or-url-missing"
  });
}

// Replace comment and string/template contents with spaces (same length, same
// newlines) so structure scanning cannot be fooled by text inside them.
function maskLiterals(src) {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2);
      const stop = j === -1 ? n : j + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c && (c === "`" || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, Math.min(j, n));
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

function matchClose(text, open, o, c, limit) {
  let depth = 0;
  const stop = Math.min(text.length, open + limit);
  for (let i = open; i < stop; i++) {
    const ch = text[i];
    if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Skips <...> right after the method name. Returns the index after the closing
// ">", or -1. "=>" does not close a generic level.
function skipGeneric(text, open) {
  let depth = 0;
  const stop = Math.min(text.length, open + MAX_GENERIC_CHARS);
  for (let i = open; i < stop; i++) {
    const ch = text[i];
    if (ch === "<") depth++;
    else if (ch === ">" && text[i - 1] !== "=") {
      depth--;
      if (depth === 0) return i + 1;
    } else if (ch === ";") return -1;
  }
  return -1;
}

// Splits text[from, to) at depth-0 commas. Returns [start, end] offset pairs.
function splitTopLevel(text, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push([start, i]);
      start = i + 1;
    }
  }
  if (text.slice(start, to).trim()) parts.push([start, to]);
  return parts;
}

// Properties of an object literal text: [{ key, raw, code }] where raw/code are
// the value text (original / masked).
function objectProps(arg) {
  const open = arg.code.indexOf("{");
  const close = matchClose(arg.code, open, "{", "}", MAX_CALL_CHARS);
  if (open === -1 || close === -1) return [];
  const props = [];
  for (const [a, b] of splitTopLevel(arg.code, open + 1, close)) {
    const head = /^\s*(?:([A-Za-z_$][\w$]*)|(["'])([^"']*)\2)\s*(:|$|,)/.exec(arg.raw.slice(a, b));
    if (!head) continue;
    const key = head[1] ?? head[3];
    const skip = head[0].length;
    props.push({ key, raw: arg.raw.slice(a + skip, b), code: arg.code.slice(a + skip, b) });
  }
  return props;
}

function literalString(arg) {
  const t = arg.raw.trim();
  const m = /^(["'`])((?:\\.|(?!\1)[^\\\n])*)\1$/s.exec(t.replace(/\s+as\s+const$/, ""));
  if (!m) return null;
  if (m[1] === "`" && m[2].includes("${")) return null;
  return m[2];
}

function firstArrayString(arg) {
  const open = arg.code.indexOf("[");
  if (open === -1 || !/^\s*\[/.test(arg.code)) return null;
  const close = matchClose(arg.code, open, "[", "]", MAX_CALL_CHARS);
  if (close === -1) return null;
  const [first] = splitTopLevel(arg.code, open + 1, close);
  return first ? literalString({ raw: arg.raw.slice(first[0], first[1]) }) : null;
}

function isFunctionText(code) {
  return /=>|^\s*(async\b|function\b)/.test(code);
}

function pushIdentifiers(code, out) {
  const cleaned = code.replace(/[A-Za-z_$][\w$]*(?=\s*:)/g, " ");
  for (const id of cleaned.match(/[A-Za-z_$][\w$]*/g) || []) {
    if (!MARKER_NOISE.has(id)) out.push(id);
  }
}

function lineAt(src, index) {
  let line = 1;
  for (let i = src.indexOf("\n"); i !== -1 && i < index; i = src.indexOf("\n", i + 1)) line++;
  return line;
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
