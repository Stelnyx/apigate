import fs from "fs";
import path from "path";

export const CONFIG_DEFAULTS = Object.freeze({
  frameworks: { express: true, fastify: true, nest: true, openapi: true },
  auth: Object.freeze({
    express: Object.freeze([
      "requireAuth", "authenticate", "passport.authenticate",
      "ensureAuthenticated", "isAuthenticated", "verifyToken",
      "requireRole", "requireScope", "jwt", "checkJwt"
    ]),
    fastify: Object.freeze([
      "onRequest", "preHandler", "fastify.authenticate",
      "verifyJWT", "requireAuth"
    ]),
    nest: Object.freeze([
      "UseGuards", "Auth", "Roles", "ApiBearerAuth", "JwtAuthGuard", "AuthGuard"
    ])
  }),
  failOn: Object.freeze({
    openWriteMethods: true,
    openReadMethods: false,
    drift: false
  }),
  excludePaths: Object.freeze([
    "node_modules/**",
    "dist/**",
    "build/**",
    ".next/**",
    "**/*.test.*",
    "**/*.spec.*",
    "test/**",
    "tests/**",
    "__tests__/**"
  ]),
  severityOverrides: Object.freeze([])
});

function isWithinTarget(targetDir, relPath) {
  if (!relPath) return true;
  const resolved = path.resolve(targetDir, relPath);
  const targetResolved = path.resolve(targetDir);
  return resolved === targetResolved || resolved.startsWith(targetResolved + path.sep);
}

function mergeAuth(rawAuth) {
  const out = {
    express: [...CONFIG_DEFAULTS.auth.express],
    fastify: [...CONFIG_DEFAULTS.auth.fastify],
    nest: [...CONFIG_DEFAULTS.auth.nest]
  };
  if (rawAuth && typeof rawAuth === "object") {
    for (const k of ["express", "fastify", "nest"]) {
      if (Array.isArray(rawAuth[k])) out[k] = rawAuth[k].map(String);
    }
  }
  return out;
}

function mergeFailOn(rawFailOn) {
  const out = { ...CONFIG_DEFAULTS.failOn };
  if (rawFailOn && typeof rawFailOn === "object") {
    if (typeof rawFailOn.openWriteMethods === "boolean") out.openWriteMethods = rawFailOn.openWriteMethods;
    if (typeof rawFailOn.openReadMethods === "boolean") out.openReadMethods = rawFailOn.openReadMethods;
    if (typeof rawFailOn.drift === "boolean") out.drift = rawFailOn.drift;
  }
  return out;
}

function mergeFrameworks(rawFw) {
  const out = { ...CONFIG_DEFAULTS.frameworks };
  if (rawFw && typeof rawFw === "object") {
    for (const k of ["express", "fastify", "nest", "openapi"]) {
      if (typeof rawFw[k] === "boolean") out[k] = rawFw[k];
    }
  }
  return out;
}

export function defaultConfig() {
  return {
    frameworks: { ...CONFIG_DEFAULTS.frameworks },
    auth: mergeAuth(null),
    failOn: { ...CONFIG_DEFAULTS.failOn },
    excludePaths: [...CONFIG_DEFAULTS.excludePaths],
    severityOverrides: []
  };
}

export function loadConfig(targetDir) {
  const cfgPath = path.join(targetDir, ".apigate.config.json");
  if (!fs.existsSync(cfgPath)) return defaultConfig();

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {
    console.error(`[apigate] Invalid JSON in ${cfgPath} — using defaults`);
    return defaultConfig();
  }

  void isWithinTarget;

  return {
    frameworks: mergeFrameworks(raw.frameworks),
    auth: mergeAuth(raw.auth),
    failOn: mergeFailOn(raw.failOn),
    excludePaths: Array.isArray(raw.excludePaths) ? raw.excludePaths.map(String) : [...CONFIG_DEFAULTS.excludePaths],
    severityOverrides: Array.isArray(raw.severityOverrides) ? raw.severityOverrides : []
  };
}
