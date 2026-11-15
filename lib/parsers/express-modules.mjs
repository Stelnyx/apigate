import path from "path";

/**
 * Cross-file Express mount resolution. Pure graph code: it never touches an
 * AST. `parseExpress` extracts, per file, the exported router bindings and the
 * `X.use(prefix, ...mw, importedRouter)` calls; this module links them by
 * module specifier and rewrites route paths with the mount prefixes found.
 *
 * Results depend only on complete maps keyed by absolute path, never on file
 * order, so forward and reversed candidate lists give the same output.
 */

const SPEC_EXTS = [".js", ".mjs", ".cjs", ".ts", ".tsx"];
const MAX_CHAINS = 64;
export const REASON_CROSS_FILE = "mount-prefix-cross-file";
export const REASON_NOT_STATIC = "mount-prefix-not-static";

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function joinPath(prefix, suffix) {
  if (!prefix) return suffix || "/";
  if (!suffix || suffix === "/") return prefix.replace(/\/$/, "") || "/";
  const a = prefix.replace(/\/$/, "");
  const b = suffix.startsWith("/") ? suffix : "/" + suffix;
  const joined = a + b;
  return joined || "/";
}

/** Join two mount prefixes where an empty one means "no prefix". */
function composePrefix(a, b) {
  if (!a) return b;
  if (!b) return a;
  return joinPath(a, b);
}

function unionMarkers(a, b) {
  return [...new Set([...a, ...b])].sort();
}

/**
 * Absolute path of the scanned file a relative specifier points at, or null.
 * Tries the path as written, then each extension, then `<dir>/index<ext>`,
 * in a fixed order. Package names and aliases are never resolved.
 */
export function resolveSpecifier(fromAbs, spec, fileSet) {
  if (typeof spec !== "string") return null;
  if (!(spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..")) return null;
  const base = path.resolve(path.dirname(fromAbs), spec);
  if (SPEC_EXTS.includes(path.extname(base).toLowerCase()) && fileSet.has(base)) return base;
  for (const ext of SPEC_EXTS) if (fileSet.has(base + ext)) return base + ext;
  for (const ext of SPEC_EXTS) {
    const idx = path.join(base, "index" + ext);
    if (fileSet.has(idx)) return idx;
  }
  return null;
}

function createResolver(modules, fileSet) {
  const incoming = new Map();
  const mountTargets = new Set();
  const tainted = new Set();

  for (const abs of [...modules.keys()].sort()) {
    const mod = modules.get(abs);
    for (const m of [...mod.mounts].sort((x, y) => x.start - y.start)) {
      const targetAbs = resolveSpecifier(abs, m.spec, fileSet);
      if (!targetAbs) continue;
      mountTargets.add(targetAbs);
      const id = targetAbs + "\0" + m.key;
      if (!incoming.has(id)) incoming.set(id, []);
      incoming.get(id).push(m);
      const target = modules.get(targetAbs);
      if (target && (target.isTs || !target.exports.has(m.key))) tainted.add(targetAbs);
    }
  }

  const fail = (reason) => ({ fail: reason });

  // Chains `{prefix, markers}` for routes owned by the exported binding
  // `name` of `abs`; null when nothing mounts it; `{fail}` when the prefix
  // cannot be composed (all-or-nothing, never a partial path).
  const chainsFor = (abs, name, visiting = new Set()) => {
    const mod = modules.get(abs);
    const mounts = [];
    for (const [key, bound] of mod.exports) {
      if (bound === name) mounts.push(...(incoming.get(abs + "\0" + key) || []));
    }
    if (mounts.length === 0) return null;
    mounts.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.start - y.start));

    const id = abs + "\0" + name;
    if (visiting.has(id)) return fail(REASON_CROSS_FILE);
    visiting.add(id);
    try {
      const out = new Map();
      for (const m of mounts) {
        if (m.prefix === null) return fail(REASON_NOT_STATIC);
        const owner = modules.get(m.file);
        if (m.ownerName && owner.routerUnresolved.has(m.ownerName)) return fail(REASON_NOT_STATIC);
        const sameFile = m.ownerName && hasOwn(owner.routerMounts, m.ownerName);
        const rooted = m.ownerName && owner.rootMounted.has(m.ownerName);
        // `rooted` only says the owner router sits on an `express()` app. The
        // prefix is complete only if that app is itself a root: not mounted
        // in its own file and not mounted from another file.
        if (sameFile && rooted) {
          const app = owner.rootMounted.get(m.ownerName);
          if (hasOwn(owner.routerMounts, app) || owner.routerUnresolved.has(app)) return fail(REASON_CROSS_FILE);
          const appUp = chainsFor(m.file, app, visiting);
          if (appUp) return fail(REASON_CROSS_FILE);
        }
        // A same-file mount on another Router() is not chained, so the full
        // prefix is unknown. Only a mount straight on an app is complete.
        if (sameFile && !rooted) return fail(REASON_CROSS_FILE);
        const local = sameFile ? owner.routerMounts[m.ownerName] : "";
        const base = composePrefix(local, m.prefix);
        let ups = null;
        if (m.ownerLinked) {
          const up = chainsFor(m.file, m.ownerLinked, visiting);
          if (up && up.fail) return up;
          if (up) {
            // Mounted in its own file and from another file: separate
            // mounts of one router, so the prefixes must not be stacked.
            if (sameFile) return fail(REASON_CROSS_FILE);
            ups = up.chains;
          }
          // An exported Router() nothing reaches is not a root: its own
          // prefix lives in a file we cannot see.
          else if (!m.ownerIsApp && !rooted && isExported(owner, m.ownerLinked)) return fail(REASON_CROSS_FILE);
        }
        if (!ups) ups = [{ prefix: "", markers: [] }];
        for (const u of ups) {
          const prefix = composePrefix(u.prefix, base);
          const markers = unionMarkers(u.markers, m.markers);
          out.set(prefix + "\0" + markers.join(","), { prefix, markers });
          if (out.size > MAX_CHAINS) return fail(REASON_CROSS_FILE);
        }
      }
      const chains = [...out.values()].sort((x, y) => {
        if (x.prefix !== y.prefix) return x.prefix < y.prefix ? -1 : 1;
        const xm = x.markers.join(","), ym = y.markers.join(",");
        return xm < ym ? -1 : xm > ym ? 1 : 0;
      });
      return { chains };
    } finally {
      visiting.delete(id);
    }
  };

  return { chainsFor, mountTargets, tainted };
}

function isExported(mod, name) {
  for (const bound of mod.exports.values()) if (bound === name) return true;
  return false;
}

// True when the file exports a Router() that no resolved chain reaches.
function hasUnreachedExportedRouter(mod, abs, resolver) {
  for (const name of new Set(mod.exports.values())) {
    if (mod.apps && mod.apps.has(name)) continue;
    if (mod.rootMounted.has(name)) continue;
    if (resolver.chainsFor(abs, name) === null) return true;
  }
  return false;
}

function unresolvedCopy(ep, reason) {
  return { ...ep, path: null, resolved: false, unresolvedReason: reason };
}

/**
 * Rewrite the endpoints emitted per file with the prefixes and middleware of
 * the mounts that lead to them. `pending` maps each endpoint object to
 * `{abs, ownerName, linked, isRouter}`; `linked` is the Program-level router
 * binding that owns the route, or null, and `isRouter` tells `Router()` from
 * an `express()` app. An exported router no resolved chain reaches becomes
 * unresolved; an app stays a root.
 */
export function applyCrossFileMounts(endpoints, modules, pending, fileSet) {
  const resolver = createResolver(modules, fileSet);

  const out = [];
  for (const ep of endpoints) {
    const p = pending.get(ep);
    if (!p || ep.resolved === false) {
      out.push(ep);
      continue;
    }
    const res = p.linked ? resolver.chainsFor(p.abs, p.linked) : null;
    if (res && res.fail) {
      out.push(unresolvedCopy(ep, res.fail));
    } else if (res && hasOwn(modules.get(p.abs).routerMounts, p.linked)) {
      // Mounted in its own file and from another file: those are separate
      // mounts of the same router, so the two prefixes must not be stacked.
      out.push(unresolvedCopy(ep, REASON_CROSS_FILE));
    } else if (res) {
      for (const c of res.chains) {
        out.push({ ...ep, path: joinPath(c.prefix, ep.path), authMarkers: unionMarkers(ep.authMarkers, c.markers) });
      }
    } else if (p.linked && p.isRouter && isExported(modules.get(p.abs), p.linked) &&
               !modules.get(p.abs).rootMounted.has(p.linked)) {
      // An exported Router() nothing in the scan reaches: its real prefix
      // lives in a file we cannot see (alias, package, .ts, sub-directory).
      out.push(unresolvedCopy(ep, REASON_CROSS_FILE));
    } else if (resolver.tainted.has(p.abs) ||
               (p.ownerName && hasOwn(modules.get(p.abs).routerMounts, p.ownerName) &&
                (resolver.mountTargets.has(p.abs) || hasUnreachedExportedRouter(modules.get(p.abs), p.abs, resolver)))) {
      out.push(unresolvedCopy(ep, REASON_CROSS_FILE));
    } else {
      out.push(ep);
    }
  }
  return out;
}
