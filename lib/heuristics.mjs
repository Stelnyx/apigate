import { normalizePath, normalizeMethod } from "./utils.mjs";

/**
 * Intentional-public heuristic.
 *
 * Most production APIs intentionally expose a handful of unauthenticated
 * endpoints: sign-up, login, refresh, password reset, OAuth callbacks,
 * health probes. ApiGate's default `openWriteMethods: true` gate flagged
 * every one of these as FAIL on first run — a wolf-cry that hurt the
 * "first impression" trust signal more than it caught real issues.
 *
 * This module classifies common public-auth surface as
 * `intentionalPublic: true`. Endpoints with that marker:
 *   - Stay in the inventory (never hidden).
 *   - Keep their posture (OPEN / UNKNOWN — heuristic does not lie about
 *     declared posture, only about intent).
 *   - Are excluded from the default exit-1 gate.
 *   - Are excluded from the Auth Coverage denominator (they're declared
 *     public-by-design, not a coverage gap).
 *
 * The user can flip `failOn.intentionalPublic: true` for strict audits,
 * or override `publicAuthPatterns` entirely in `.apigate.config.json`.
 *
 * The patterns are deterministic — same input always yields the same
 * classification. Method + normalized-path matching only; no fuzzy
 * matching, no NLP, no surprises.
 *
 * Honest disclosure (added to LIMITATIONS in lib/report.mjs):
 *   "ApiGate uses a heuristic pattern list to mark common public auth
 *   paths (login/signup/refresh/etc.) as intentionally public. The
 *   heuristic can be wrong in both directions — review the marked
 *   endpoints in your report and override `publicAuthPatterns` in
 *   .apigate.config.json if your project disagrees."
 */

export const DEFAULT_PUBLIC_AUTH_PATTERNS = Object.freeze([
  // Login / sign-in
  { method: "POST", path: "/login" },
  { method: "POST", path: "/signin" },
  { method: "POST", path: "/sign-in" },
  { method: "POST", path: "/sessions" },
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/signin" },
  { method: "POST", path: "/auth/sign-in" },
  { method: "POST", path: "/auth/sessions" },
  { method: "POST", path: "/api/login" },
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/users/login" },
  { method: "POST", path: "/api/users/login" },

  // Sign-up / register
  { method: "POST", path: "/signup" },
  { method: "POST", path: "/sign-up" },
  { method: "POST", path: "/register" },
  { method: "POST", path: "/users" },
  { method: "POST", path: "/auth/signup" },
  { method: "POST", path: "/auth/register" },

  // Token refresh / revoke / verify
  { method: "POST", path: "/token" },
  { method: "POST", path: "/refresh" },
  { method: "POST", path: "/auth/refresh" },
  { method: "POST", path: "/auth/token" },
  { method: "POST", path: "/oauth/token" },
  { method: "POST", path: "/oauth2/token" },

  // Logout (no auth required by some apps — opt-out via config)
  { method: "POST", path: "/logout" },
  { method: "POST", path: "/auth/logout" },

  // Password reset flows
  { method: "POST", path: "/password/forgot" },
  { method: "POST", path: "/password/reset" },
  { method: "POST", path: "/auth/password/forgot" },
  { method: "POST", path: "/auth/password/reset" },
  { method: "POST", path: "/forgot-password" },
  { method: "POST", path: "/reset-password" },

  // Email + identity verification
  { method: "POST", path: "/verify-email" },
  { method: "POST", path: "/auth/verify-email" },
  { method: "GET",  path: "/verify-email/:param" },
  { method: "GET",  path: "/auth/verify-email/:param" },
  { method: "POST", path: "/auth/verify" },

  // OAuth callbacks (public by definition — the redirect target is a browser).
  // Note: provider-specific callbacks like /auth/google/callback are NOT
  // matched here because the path segment `google` is a literal, not a
  // route param. v0.1.1 matches by exact normalized path only. Users with
  // provider-specific callbacks should extend `publicAuthPatterns` in
  // .apigate.config.json.
  { method: "GET",  path: "/auth/callback" },
  { method: "GET",  path: "/oauth/callback" },
  { method: "GET",  path: "/oauth2/callback" },

  // Health / readiness — almost universally public; included so a
  // `/health` GET doesn't show up as an auth coverage gap.
  { method: "GET", path: "/" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/healthz" },
  { method: "GET", path: "/ready" },
  { method: "GET", path: "/readyz" },
  { method: "GET", path: "/ping" },
  { method: "GET", path: "/status" },
  { method: "GET", path: "/api" },
  { method: "GET", path: "/api/health" }
]);

/**
 * Mark each endpoint with `intentionalPublic: boolean` according to the
 * provided pattern list. Patterns are matched after `normalizePath` — i.e.
 * `/users/:id`, `/users/{id}`, and `/users/<id>` all collapse to
 * `/users/:param`. Method match is exact (case-insensitive).
 */
export function annotateIntentionalPublic(endpoints, patterns = DEFAULT_PUBLIC_AUTH_PATTERNS) {
  const normalized = patterns.map(p => ({
    method: normalizeMethod(p.method),
    path: normalizePath(p.path)
  }));
  const set = new Set(normalized.map(p => `${p.method} ${p.path}`));

  return endpoints.map(e => {
    if (e.resolved === false || !e.path) return { ...e, intentionalPublic: false };
    const key = `${normalizeMethod(e.method)} ${normalizePath(e.path)}`;
    const hit = set.has(key);
    return { ...e, intentionalPublic: hit };
  });
}
