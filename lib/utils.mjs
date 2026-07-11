import fs from "fs";
import path from "path";

export const DEFAULT_SCAN_OPTIONS = Object.freeze({
  maxFiles: 20000,
  maxDepth: 30,
  maxFileBytes: 1024 * 1024,
  timeoutMs: 30000,
  progressEvery: 5000,
  onProgress: null
});

export const DEFAULT_EXCLUDE_DIRS = Object.freeze([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "vendor",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vercel",
  ".output"
]);

export class ScanLimitError extends Error {
  constructor(message, stats) {
    super(message);
    this.name = "ScanLimitError";
    this.stats = stats;
  }
}

/**
 * Recursively walk targetDir, return all files matching one of `extensions`,
 * skipping any path that matches an entry in `excludePatterns` (glob-like with
 * `**` and `*`). Deterministic: sorts directory entries alphabetically before
 * recursing, so two runs against the same tree always produce the same order.
 */
export function walkFiles(targetDir, extensions, excludePatterns = [], scanOptions = {}) {
  const out = [];
  const exts = new Set(extensions.map(e => e.toLowerCase()));
  const matchers = excludePatterns.map(compileGlob);
  const targetAbs = path.resolve(targetDir);
  const options = { ...DEFAULT_SCAN_OPTIONS, ...scanOptions };
  const seenDirs = new Set();
  const startedAt = Date.now();
  let visitedFiles = 0;
  let visitedDirs = 0;
  let skippedSymlinks = 0;
  let skippedDeepDirs = 0;

  function relFromTarget(p) {
    return path.relative(targetAbs, p).split(path.sep).join("/");
  }

  function stats() {
    return {
      visitedFiles,
      visitedDirs,
      matchedFiles: out.length,
      skippedSymlinks,
      skippedDeepDirs
    };
  }

  function checkBounds() {
    if (visitedFiles > options.maxFiles) {
      throw new ScanLimitError(
        `scan exceeded max files (${options.maxFiles}); narrow the target or raise --max-files`,
        stats()
      );
    }
    if (Date.now() - startedAt > options.timeoutMs) {
      throw new ScanLimitError(
        `scan exceeded timeout (${options.timeoutMs}ms); narrow the target or raise --scan-timeout-ms`,
        stats()
      );
    }
    if (options.onProgress && options.progressEvery > 0 && visitedFiles > 0 && visitedFiles % options.progressEvery === 0) {
      options.onProgress(stats());
    }
  }

  function visit(dir, depth) {
    if (depth > options.maxDepth) {
      skippedDeepDirs++;
      return;
    }
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (seenDirs.has(real)) return;
    seenDirs.add(real);
    visitedDirs++;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Avoid locale-sensitive ordering (localeCompare depends on host ICU/locale).
    // Deterministic across environments: pure codepoint comparison.
    entries.sort((a, b) => (a.name === b.name ? 0 : a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = relFromTarget(full);
      if (ent.isSymbolicLink()) {
        skippedSymlinks++;
        continue;
      }
      if (ent.isDirectory() && DEFAULT_EXCLUDE_DIRS.includes(ent.name)) continue;
      if (matchers.some(m => m(rel))) continue;
      if (ent.isDirectory()) {
        visit(full, depth + 1);
      } else if (ent.isFile()) {
        visitedFiles++;
        checkBounds();
        const ext = path.extname(ent.name).toLowerCase();
        if (exts.has(ext)) out.push(full);
      }
    }
  }
  visit(targetAbs, 0);
  return out;
}

/** Return the deterministic subset of an existing candidate index for `extensions`. */
export function filterFilesByExtension(files, extensions) {
  const exts = new Set(extensions.map(e => e.toLowerCase()));
  return files.filter(file => exts.has(path.extname(file).toLowerCase()));
}

export function readTextFile(file, maxBytes = DEFAULT_SCAN_OPTIONS.maxFileBytes) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return { ok: false, skipped: "stat-error", text: "" };
  }
  if (st.size > maxBytes) {
    return { ok: false, skipped: `file-too-large:${st.size}`, text: "" };
  }
  try {
    return { ok: true, skipped: null, text: fs.readFileSync(file, "utf-8") };
  } catch {
    return { ok: false, skipped: "read-error", text: "" };
  }
}

/**
 * Compile a simple glob pattern to a tester. Supports `*` (any chars except /)
 * and `**` (any chars including /). No brace expansion, no character classes —
 * matches what npm-style ignore patterns commonly need.
 */
export function compileGlob(pattern) {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\.^$+?()[]{}|".includes(c)) {
      re += "\\" + c;
    } else if (c === "/") {
      re += "/";
    } else {
      re += c;
    }
  }
  re += "$";
  const rx = new RegExp(re);
  return (s) => rx.test(s);
}

/**
 * Normalize an endpoint path for cross-source comparison.
 *   /users/:id      → /users/:param
 *   /users/{id}     → /users/:param
 *   /users/<id>     → /users/:param
 *   trailing slash dropped (except for root)
 */
export function normalizePath(p) {
  if (!p) return p;
  let out = String(p);
  out = out.replace(/\{[^/}]+\}/g, ":param");
  out = out.replace(/<[^/>]+>/g, ":param");
  out = out.replace(/:[^/]+/g, ":param");
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  if (!out.startsWith("/")) out = "/" + out;
  return out;
}

/** Stable HTTP method casing. */
export function normalizeMethod(m) {
  return String(m || "").toUpperCase();
}

/**
 * Stable endpoint sort key: method, path, file, line.
 */
export function sortEndpoints(arr) {
  return [...arr].sort((a, b) => {
    if (a.method !== b.method) return a.method < b.method ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if ((a.file || "") !== (b.file || "")) return (a.file || "") < (b.file || "") ? -1 : 1;
    return (a.line || 0) - (b.line || 0);
  });
}

/** Make a relative path from the target dir, forward-slashed. */
export function relPath(targetDir, file) {
  return path.relative(path.resolve(targetDir), path.resolve(file)).split(path.sep).join("/");
}
