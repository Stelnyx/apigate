# Sample: Immich (NestJS)

Public OSS NestJS reference scanned with ApiGate v0.3.0.

## Upstream

- Repo: <https://github.com/immich-app/immich>
- Path scanned: `server/`
- Pinned SHA: `815ff677fc4837e46d58c47312bd98e04163a69a`

## Reproduce

```bash
git clone --depth 1 https://github.com/immich-app/immich /tmp/immich
cd /tmp/immich && git checkout 815ff677fc4837e46d58c47312bd98e04163a69a
APIGATE_TIMESTAMP="2026-05-20T00:00:00.000Z" \
  apigate /tmp/immich/server \
  --output-dir samples/immich-nest \
  --strip-paths
```

## Headline (v0.3.0, with expanded `auth.nest` defaults)

- 255 endpoints
- 183 GUARDED · 35 OPEN · 37 UNKNOWN · 3 intentional-public
- 14 HIGH · 50 MED · 191 LOW
- Headline 64 / 100 · STATUS FAIL (open-write reason)
- Rubrics: inventory 85 · auth-coverage 72 · open-risk 0 · determinism 100

## Why FAIL is honest here

Immich is in active development; 14 HIGH (open-write) endpoints are real findings worth triage. Some may be protected by NestJS global guards (`useGlobalGuards` / `APP_GUARD`) — see `parserCapabilities.nest.globalGuardDetection` for the limitation; pin specific endpoints in `severityOverrides` if your audit determines they are actually protected at runtime.

## What changed v0.2.1 → v0.3.0 on this target

- Headline: 37 → 64
- GUARDED: 0 → 183
- Root cause: ApiGate's `auth.nest` defaults did not include `Authenticated` (Immich's custom guard decorator) or several Swagger security decorators. Defaults expanded in v0.3 (`Authenticated`, `RequireAuth`, `ApiCookieAuth`, `ApiSecurity`).
- The bidirectional method-decorator scan (Bug A in the v0.3 plan) also lands here but was less load-bearing — Immich already places guards above the HTTP-method decorator. The defaults change carried most of the gain.
