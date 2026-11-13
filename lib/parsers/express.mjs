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
 *   3. Track router variables: every identifier assigned from `express()`,
 *      `express.Router()`, `Router()` or `new express.Router()` (including
 *      renamed `express` / `Router` imports), whatever its name. The name
 *      heuristic (`app`, `router`, `*Router`, ...) still applies on top, so
 *      routers received as parameters (`module.exports = (app) => ...`) or
 *      via `this.router` keep working.
 *   4. Detect mount calls: `app.use('/prefix', r)` — record prefix→routerVar
 *      bindings inside the SAME file (cross-file router import resolution is
 *      not attempted; dynamic prefixes are flagged UNRESOLVED).
 *   5. Detect path-less middleware `X.use(mw, ...)`: its identifiers become
 *      auth markers for every route registered on X LATER in source order.
 *      Routes registered before it are unaffected.
 *   6. Detect `<obj>.<method>(<path>, ...handlers)` and
 *      `<obj>.route(<path>).<method>(...handlers).<method>(...)` chains:
 *        - emit endpoint with the path as-is OR with the resolved mount
 *          prefix if <obj> has a known mount in this file.
 *        - If <method> is not a known HTTP verb, skip.
 *        - If the path is not a string literal, emit UNRESOLVED.
 *   7. Collect middleware identifiers from the handler args, by Identifier
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
    const ctx = analyzeBindings(ast);
    const isRouter = (name) => isRouterRef(name, ctx);
    const routerMounts = {};
    const routerUnresolved = new Set();
    const routerUses = {};
    collectMounts(ast, routerMounts, routerUnresolved, routerUses, ctx, isRouter);

    walk.simple(ast, {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
        const prop = callee.property;
        if (!prop || prop.type !== "Identifier") return;
        const method = prop.name.toLowerCase();
        if (!HTTP_METHODS.has(method)) return;

        // `X.route(path).get(...).post(...)`: the path lives on the route()
        // call at the bottom of the chain; every arg of the verb call is a
        // handler.
        const routeCall = callee.object?.type === "CallExpression" ? routeChainBase(callee.object) : null;
        const ownerNode = routeCall ? routeCall.callee.object : callee.object;
        const objName = identName(ownerNode);
        if (!objName) return;
        if (!isRouter(objName)) return;

        const args = node.arguments || [];
        let pathArg, handlerArgs, position, line;
        if (routeCall) {
          pathArg = (routeCall.arguments || [])[0];
          handlerArgs = args;
          position = routeCall.start;
          line = prop.loc?.start?.line ?? node.loc?.start?.line ?? null;
        } else {
          if (args.length < 1) return;
          pathArg = args[0];
          handlerArgs = args.slice(1);
          position = node.start;
          line = node.loc?.start?.line ?? null;
        }

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

        const markerSet = new Set(collectMarkers(handlerArgs));
        for (const use of routerUses[objName] || []) {
          if (use.position < position) for (const m of use.markers) markerSet.add(m);
        }
        const authMarkers = [...markerSet].sort();

        endpoints.push({
          method: method === "all" ? "ALL" : method.toUpperCase(),
          path: finalPath,
          file: rel,
          line,
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

function collectMounts(ast, routerMounts, routerUnresolved, routerUses, ctx, isRouter) {
  walk.simple(ast, {
    CallExpression(node) {
      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
      if (callee.property?.type !== "Identifier" || callee.property.name !== "use") return;
      const args = node.arguments || [];
      if (args.length < 1) return;

      // Path-less middleware: `X.use(mw, ...)`. Recorded with its source
      // position so only routes registered on X after it inherit the markers.
      const ownerName = identName(callee.object);
      if (ownerName && isRouter(ownerName) && isPathlessUse(args, ctx)) {
        const mwArgs = args.filter(a => {
          const n = identName(a);
          return !(n && isRouter(n));
        });
        const markers = collectMarkers(mwArgs);
        if (markers.length > 0) {
          (routerUses[ownerName] ||= []).push({ position: node.start, markers });
        }
      }

      if (args.length < 2) return;
      const prefix = stringValue(args[0]);
      for (let i = 1; i < args.length; i++) {
        const refName = identName(args[i]);
        if (!refName || !isRouter(refName)) continue;
        if (prefix !== null) {
          routerMounts[refName] = prefix;
        } else {
          routerUnresolved.add(refName);
        }
      }
    }
  });
}

/**
 * Walk down `.get(...).post(...)` to the `.route(path)` call that starts the
 * chain. Returns that CallExpression, or null when the chain does not start
 * with `.route(...)` (e.g. `axios.create().get(url)`).
 */
function routeChainBase(node) {
  let cur = node;
  while (cur && cur.type === "CallExpression") {
    const c = cur.callee;
    if (!c || c.type !== "MemberExpression" || c.computed || c.property?.type !== "Identifier") return null;
    const name = c.property.name;
    if (name === "route") return cur;
    if (!HTTP_METHODS.has(name.toLowerCase())) return null;
    cur = c.object;
  }
  return null;
}

/**
 * Pre-pass over one file: which identifiers are router instances, and how
 * every `const/let/var` / function name is initialized (used to decide
 * whether `X.use(name, ...)` starts with a function or a path).
 * Scope-insensitive on purpose (same as the rest of this parser): a name
 * that is assigned from a router factory anywhere in the file is a router.
 */
function analyzeBindings(ast) {
  const expressNames = new Set(["express"]);
  const routerFactoryNames = new Set(["Router"]);
  const routers = new Set();
  const bindings = new Map();

  const isExpressSource = (node) => stringValue(node) === "express";
  const isRequireExpress = (node) =>
    node?.type === "CallExpression" && node.callee?.type === "Identifier" &&
    node.callee.name === "require" && isExpressSource(node.arguments?.[0]);

  // Pass 1: express / Router import aliases.
  walk.simple(ast, {
    ImportDeclaration(node) {
      if (!isExpressSource(node.source)) return;
      for (const sp of node.specifiers || []) {
        if (sp.type === "ImportDefaultSpecifier" || sp.type === "ImportNamespaceSpecifier") {
          expressNames.add(sp.local.name);
        } else if (sp.type === "ImportSpecifier" && sp.imported?.name === "Router") {
          routerFactoryNames.add(sp.local.name);
        }
      }
    },
    VariableDeclarator(node) {
      if (!isRequireExpress(node.init)) return;
      if (node.id?.type === "Identifier") expressNames.add(node.id.name);
      if (node.id?.type === "ObjectPattern") {
        for (const p of node.id.properties || []) {
          if (p.type === "Property" && !p.computed && p.key?.type === "Identifier" &&
              p.key.name === "Router" && p.value?.type === "Identifier") {
            routerFactoryNames.add(p.value.name);
          }
        }
      }
    }
  });

  const isRouterFactory = (init) => {
    let n = init;
    // `const app = module.exports = express()`
    while (n?.type === "AssignmentExpression") n = n.right;
    if (!n || (n.type !== "CallExpression" && n.type !== "NewExpression")) return false;
    const c = n.callee;
    if (c?.type === "Identifier") return expressNames.has(c.name) || routerFactoryNames.has(c.name);
    if (c?.type === "MemberExpression" && !c.computed && c.property?.type === "Identifier" &&
        c.property.name === "Router" && c.object?.type === "Identifier") {
      return expressNames.has(c.object.name);
    }
    // `require("express")()` / `require("express").Router()`
    if (c?.type === "CallExpression" && isRequireExpress(c)) return true;
    if (c?.type === "MemberExpression" && !c.computed && c.property?.type === "Identifier" &&
        c.property.name === "Router" && isRequireExpress(c.object)) return true;
    return false;
  };

  // Pass 2: router instances + other local bindings.
  walk.simple(ast, {
    VariableDeclarator(node) {
      if (node.id?.type !== "Identifier") return;
      const name = node.id.name;
      if (isRouterFactory(node.init)) routers.add(name);
      if (!bindings.has(name)) bindings.set(name, node.init || null);
    },
    AssignmentExpression(node) {
      if (node.operator !== "=" || !isRouterFactory(node.right)) return;
      const name = identName(node.left);
      if (name) routers.add(name);
    },
    FunctionDeclaration(node) {
      if (node.id?.name && !bindings.has(node.id.name)) bindings.set(node.id.name, node);
    }
  });

  return { routers, bindings };
}

/**
 * A name is a router reference when it was assigned from a router factory in
 * this file, or when it matches the name heuristic. The heuristic is kept for
 * AST files too: routers and apps that arrive as function parameters
 * (`module.exports = (router) => { router.get(...) }`) or `this.router` have
 * no factory call in the file, and dropping them would lose routes.
 */
function isRouterRef(name, ctx) {
  if (!name) return false;
  return ctx.routers.has(name) || isPlausibleRouterRef(name);
}

const PATH_LIKE_TYPES = new Set([
  "Literal", "TemplateLiteral", "ArrayExpression", "BinaryExpression",
  "LogicalExpression", "ConditionalExpression", "MemberExpression"
]);
const FUNCTION_TYPES = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"]);
const STRING_RETURNING_CALLS = new Set(["join", "resolve", "concat", "replace", "toString", "format", "get", "slice", "trim"]);

/**
 * True when `X.use(args...)` registers middleware without a mount path.
 * Express decides this at runtime (`typeof args[0] === "function"`); here we
 * only say yes when the first arg is certainly a function, so a dynamic
 * prefix can never turn into a router-wide auth marker. Unclear cases are
 * ignored, which leaves routes OPEN rather than wrongly GUARDED.
 */
function isPathlessUse(args, ctx) {
  const first = args[0];
  if (!first || first.type === "SpreadElement") return false;
  if (stringValue(first) !== null) return false;
  // A single argument cannot be a bare path: Express requires a handler.
  if (args.length === 1) return !PATH_LIKE_TYPES.has(first.type) || first.type === "MemberExpression";
  if (FUNCTION_TYPES.has(first.type)) return true;
  if (first.type === "CallExpression") {
    const c = first.callee;
    if (c?.type === "MemberExpression" && c.property?.type === "Identifier" &&
        STRING_RETURNING_CALLS.has(c.property.name)) return false;
    return true;
  }
  if (first.type === "Identifier") {
    const init = ctx.bindings.get(first.name);
    return !!init && FUNCTION_TYPES.has(init.type);
  }
  return false;
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
