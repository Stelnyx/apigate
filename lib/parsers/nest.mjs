import { CONFIG_DEFAULTS } from "../config.mjs";
import { readTextFile, walkFiles, filterFilesByExtension, relPath } from "../utils.mjs";

const EXTS = [".ts", ".js", ".mjs", ".tsx"];

const METHOD_DECORATORS = [
  "Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All"
];
// A line holding another method anchor belongs to a different method: the
// decorator scans stop there so one-line methods do not borrow each other's
// decorators.
const METHOD_ANCHOR_LINE = new RegExp(`@(?:${METHOD_DECORATORS.join("|")})\\s*\\(`);

/**
 * Parse NestJS routes statically.
 *
 * NestJS sources are usually TypeScript with decorators; full TS AST parsing
 * is heavy. v0.1 uses a focused regex extractor that handles the canonical
 * NestJS layout:
 *
 *   @Controller('users')
 *   @UseGuards(JwtAuthGuard)
 *   export class UsersController {
 *     @Get(':id')
 *     @ApiBearerAuth()
 *     async findOne(@Param('id') id: string) { ... }
 *   }
 *
 * Strategy:
 *   1. Locate every `@Controller(...)` decorator + the class declaration it
 *      attaches to. Capture class-level decorators (UseGuards, Auth, etc.).
 *   2. For each method inside that class, scan upward from the method header
 *      to collect contiguous decorators (HTTP method + auth markers).
 *   3. Combine class-level + method-level markers as the endpoint's
 *      authMarkers list.
 *
 * Global guards and prefix (pre-pass over every scanned file, comments
 * stripped): `{ provide: APP_GUARD, useClass|useExisting: X }` and
 * `X.useGlobalGuards(new A(), ...)` add the guard class names as markers of
 * every Nest endpoint in the scan, unless the controller or method carries
 * a public decorator (options.publicDecorators). `X.setGlobalPrefix('lit')`
 * prefixes every endpoint (a literal `exclude` array is honored; a
 * non-literal prefix leaves them unresolved).
 *
 * Unresolvable cases (controller path is a variable, dynamic decorator
 * argument, missing class body): record with resolved: false.
 */
export function parseNest(targetDir, excludePaths = [], scanOptions = {}, candidateFiles = null, options = {}) {
  const publicDecorators = new Set(
    Array.isArray(options.publicDecorators) ? options.publicDecorators : CONFIG_DEFAULTS.publicDecorators
  );
  const files = candidateFiles === null
    ? walkFiles(targetDir, EXTS, excludePaths, scanOptions)
    : filterFilesByExtension(candidateFiles, EXTS);
  const endpoints = [];
  const warnings = [];

  const controllerFiles = [];
  const globalGuards = new Set();
  const prefixes = [];
  for (const file of files) {
    const rel = relPath(targetDir, file);
    const read = readTextFile(file, scanOptions.maxFileBytes);
    if (!read.ok) {
      if (read.skipped?.startsWith("file-too-large")) warnings.push({ file: rel, reason: read.skipped });
      continue;
    }
    const src = read.text;
    const stripped = stripComments(src);
    for (const g of findGlobalGuards(stripped)) globalGuards.add(g);
    prefixes.push(...findGlobalPrefixes(stripped));
    if (/@Controller\s*\(/.test(src)) controllerFiles.push({ rel, src });
  }
  const globalMarkers = [...globalGuards];
  const prefixInfo = resolvePrefix(prefixes);
  for (const { rel, src } of controllerFiles) {
    const controllers = findControllers(src);
    for (const ctrl of controllers) {
      const ctrlPath = ctrl.path;
      const ctrlMarkers = ctrl.classMarkers;
      const body = ctrl.body;
      const methods = findMethodDecorators(body, src, ctrl.bodyStart);

      for (const m of methods) {
        const subPath = m.path;
        const fullPath = combine(ctrlPath, subPath);
        const resolved = ctrl.resolved && m.resolved && !prefixInfo.dynamic;
        const isPublic = [...ctrlMarkers, ...m.markers].some(n => publicDecorators.has(n));
        const inherited = isPublic ? [] : globalMarkers;
        endpoints.push({
          method: m.verb.toUpperCase(),
          path: resolved ? applyPrefix(fullPath, prefixInfo) : null,
          file: rel,
          line: m.line,
          framework: "nest",
          resolved,
          authMarkers: dedupSorted([...ctrlMarkers, ...m.markers, ...inherited]),
          unresolvedReason: resolved
            ? null
            : !ctrl.resolved
              ? "controller-path-not-static-string"
              : !m.resolved
                ? "method-path-not-static-string"
                : "global-prefix-not-static-string"
        });
      }
    }
  }

  return { endpoints, warnings };
}

function stripComments(src) {
  // Keep string literals intact so "//" inside a URL string is not a comment.
  return src.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? " ");
}
function findGlobalGuards(src) {
  const out = [];
  const providerRe = /\{[^{}]*\bprovide\s*:\s*APP_GUARD\b[^{}]*\}/g;
  let m;
  while ((m = providerRe.exec(src)) !== null) {
    const g = m[0].match(/\b(?:useClass|useExisting)\s*:\s*([A-Za-z_$][\w$]*)/);
    if (g) out.push(g[1]);
  }
  const callRe = /\.useGlobalGuards\s*\(/g;
  while ((m = callRe.exec(src)) !== null) {
    const args = balancedArgs(src, m.index + m[0].length);
    for (const n of args.matchAll(/\bnew\s+([A-Za-z_$][\w$]*)\s*\(/g)) out.push(n[1]);
  }
  return out;
}
// Text between the "(" already consumed (openIdx is the index after it) and its matching ")".
function balancedArgs(src, openIdx) {
  let depth = 1;
  let i = openIdx;
  while (i < src.length && depth > 0) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") depth--;
    i++;
  }
  return src.slice(openIdx, depth === 0 ? i - 1 : i);
}
function splitTopLevel(raw) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (const c of raw) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}
function findGlobalPrefixes(src) {
  const out = [];
  const re = /\.setGlobalPrefix\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [first, second] = splitTopLevel(balancedArgs(src, m.index + m[0].length));
    const lit = first === undefined ? null : parseStringArg(first);
    const isLiteral = lit !== null && !first.trim().startsWith("{") && !first.trim().startsWith("[");
    out.push({ literal: isLiteral ? lit : null, exclude: isLiteral ? parseExclude(second) : [] });
  }
  return out;
}
function parseExclude(raw) {
  if (raw === undefined) return [];
  const arr = raw.match(/\bexclude\s*:\s*(\[[\s\S]*\])/);
  if (!arr) return [];
  const out = [];
  for (const item of splitTopLevel(arr[1].trim().slice(1, -1))) {
    const t = item.trim();
    const lit = t.startsWith("{") ? t.match(/\bpath\s*:\s*(['"`])([^'"`$]*)\1/)?.[2] ?? null : parseStringArg(t);
    if (lit !== null) out.push(trimSlashes(lit));
  }
  return out;
}
function trimSlashes(s) {
  return s.replace(/^\/+|\/+$/g, "");
}
function resolvePrefix(found) {
  if (found.length === 0) return { dynamic: false, prefix: "", exclude: [] };
  const distinct = new Set(found.map(f => (f.literal === null ? null : trimSlashes(f.literal))));
  if (distinct.has(null) || distinct.size > 1) return { dynamic: true, prefix: "", exclude: [] };
  return { dynamic: false, prefix: [...distinct][0], exclude: found.flatMap(f => f.exclude) };
}
function applyPrefix(fullPath, info) {
  if (info.prefix === "") return fullPath;
  if (info.exclude.includes(trimSlashes(fullPath))) return fullPath;
  return combine(info.prefix, fullPath);
}
function findControllers(src) {
  const out = [];
  const ctrlRe = /@Controller\s*\(([\s\S]*?)\)/g;
  let m;
  while ((m = ctrlRe.exec(src)) !== null) {
    const argRaw = m[1].trim();
    const { className, bodyStart, bodyEnd, headerStart } = locateClassAfter(src, m.index + m[0].length);
    if (className === null) continue;
    // Collect every decorator immediately preceding the class declaration
    // (above and between @Controller and the class keyword). Drop @Controller
    // itself from the marker list since it's the framework anchor, not auth.
    const classMarkers = collectAdjacentDecorators(src, headerStart).filter(n => n !== "Controller");
    const body = src.slice(bodyStart, bodyEnd);

    let pathLit;
    let resolved;
    if (argRaw === "") {
      pathLit = "";
      resolved = true;
    } else {
      pathLit = parseStringArg(argRaw);
      resolved = pathLit !== null;
    }

    out.push({
      path: resolved ? pathLit : null,
      classMarkers,
      bodyStart,
      bodyEnd,
      body,
      resolved
    });
  }
  return out;
}

function collectAdjacentDecorators(src, controllerIdx) {
  const before = src.slice(0, controllerIdx);
  const lines = before.split(/\n/);
  const markers = [];
  // Decorators on the same line, before the anchor: `@Public() @Get('x') m() {}`.
  const sameLine = lines[lines.length - 1].trim();
  if (sameLine.startsWith("@")) {
    for (const n of sameLine.matchAll(/@([A-Za-z_$][\w$]*)/g)) markers.push(n[1]);
  }
  for (let i = lines.length - 2; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (line.startsWith("//") || line.startsWith("*")) continue;
    if (!line.startsWith("@")) break;
    if (METHOD_ANCHOR_LINE.test(line)) break;
    const name = line.match(/^@([A-Za-z_$][\w$]*)/);
    if (name) markers.push(name[1]);
  }
  return markers;
}

/**
 * Walk DOWN from `fromIdx` (which must be the position AFTER the closing `)`
 * of a method decorator like `@Get(...)`), capturing every `@Foo` decorator
 * that appears before the actual method signature.
 *
 * Bug fixed in v0.3: NestJS commonly places guards / role decorators BELOW
 * the HTTP-method decorator and ABOVE the method body. The upward-only
 * scan in `collectAdjacentDecorators` missed those, silently marking real
 * GUARDED endpoints as OPEN.
 *
 * Same skip rules + break rule as the upward scan, just iterated forward.
 */
function collectDownwardDecorators(src, fromIdx) {
  const newlineIdx = src.indexOf("\n", fromIdx);
  if (newlineIdx === -1) return [];
  // The method signature is on the anchor line (`@Get() list() {}`): the
  // decorators on the following lines belong to the next method.
  const restOfLine = src.slice(fromIdx, newlineIdx).replace(/\/\*.*?\*\/|\/\/.*$/g, "").trim();
  if (restOfLine !== "" && !restOfLine.startsWith("@")) return [];
  const after = src.slice(newlineIdx + 1);
  const lines = after.split(/\n/);
  const markers = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("//") || line.startsWith("*")) continue;
    if (!line.startsWith("@")) break;
    if (METHOD_ANCHOR_LINE.test(line)) break;
    const name = line.match(/^@([A-Za-z_$][\w$]*)/);
    if (name) markers.push(name[1]);
  }
  return markers;
}

function locateClassAfter(src, fromIdx) {
  const rest = src.slice(fromIdx);
  const classMatch = rest.match(/(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/);
  if (!classMatch) return { className: null, bodyStart: -1, bodyEnd: -1, headerStart: -1 };
  const headerStart = fromIdx + classMatch.index;
  const braceIdx = src.indexOf("{", headerStart);
  if (braceIdx === -1) return { className: null, bodyStart: -1, bodyEnd: -1, headerStart: -1 };
  let depth = 1;
  let i = braceIdx + 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return { className: classMatch[1], bodyStart: braceIdx + 1, bodyEnd: i - 1, headerStart };
}

function findMethodDecorators(body, fullSrc, bodyStart) {
  const out = [];
  for (const verb of METHOD_DECORATORS) {
    const re = new RegExp(`@${verb}\\s*\\(([\\s\\S]*?)\\)`, "g");
    let m;
    while ((m = re.exec(body)) !== null) {
      const absoluteIdx = bodyStart + m.index;
      const lineNo = fullSrc.slice(0, absoluteIdx).split(/\n/).length;
      const argRaw = m[1].trim();
      let pathLit;
      let resolved;
      if (argRaw === "") {
        pathLit = "";
        resolved = true;
      } else {
        pathLit = parseStringArg(argRaw);
        resolved = pathLit !== null;
      }
      const upward = collectAdjacentDecorators(fullSrc, absoluteIdx);
      const downward = collectDownwardDecorators(fullSrc, absoluteIdx + m[0].length);
      const markers = dedupSorted([...upward, ...downward]);
      out.push({
        verb,
        path: resolved ? pathLit : null,
        line: lineNo,
        resolved,
        markers
      });
    }
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

function parseStringArg(raw) {
  const s = raw.trim().replace(/,\s*$/, "");
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  if (s.startsWith("`") && s.endsWith("`") && !s.includes("${")) {
    return s.slice(1, -1);
  }
  // Object-literal form: @Controller({ path: 'users', version: '1' })
  // We extract `path` as the canonical route prefix and ignore version (the
  // version segment is mounted by NestJS via VersioningOptions at bootstrap;
  // it isn't statically resolvable from the controller alone).
  if (s.startsWith("{") && s.endsWith("}")) {
    const m = s.match(/\bpath\s*:\s*(['"`])([^'"`]+)\1/);
    if (m) return m[2];
  }
  // Array form: @Controller(['users', 'people']) — pick first; the others
  // become legitimate aliases but v0.1 reports one canonical path.
  if (s.startsWith("[") && s.endsWith("]")) {
    const m = s.match(/(['"`])([^'"`]+)\1/);
    if (m) return m[2];
  }
  return null;
}

function combine(prefix, sub) {
  const a = (prefix || "").replace(/\/$/, "");
  const b = (sub || "").replace(/^\//, "");
  if (!a && !b) return "/";
  if (!a) return "/" + b;
  if (!b) return a.startsWith("/") ? a : "/" + a;
  const head = a.startsWith("/") ? a : "/" + a;
  return head + "/" + b;
}

function dedupSorted(arr) {
  return [...new Set(arr)].sort();
}
