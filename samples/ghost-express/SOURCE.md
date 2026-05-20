# Sample: Ghost (Express)

Public OSS Express reference scanned with ApiGate v0.3.0.

## Upstream

- Repo: <https://github.com/TryGhost/Ghost>
- Path scanned: `ghost/core/`
- Pinned SHA: `870ffaef8ec13f4680d5ed9c7a9ed1ad936c083a`

## Reproduce

```bash
git clone --depth 1 https://github.com/TryGhost/Ghost /tmp/ghost
cd /tmp/ghost && git checkout 870ffaef8ec13f4680d5ed9c7a9ed1ad936c083a
# Ghost uses project-specific middleware names. Drop a config in the scan
# target so ApiGate can recognize them:
cat > /tmp/ghost/ghost/core/.apigate.config.json <<'JSON'
{
  "auth": {
    "express": [
      "authAdminApi",
      "authMemberApi",
      "authPublic",
      "authenticatedMembers",
      "requireAuth",
      "authenticate",
      "passport.authenticate"
    ]
  }
}
JSON
APIGATE_TIMESTAMP="2026-05-20T00:00:00.000Z" \
  apigate /tmp/ghost/ghost/core \
  --output-dir samples/ghost-express \
  --strip-paths
```

## Headline (v0.3.0)

- 303 endpoints
- 199 GUARDED · 99 OPEN · 5 UNKNOWN · 2 intentional-public
- 35 HIGH · 18 MED · 250 LOW
- Headline 66 / 100 · STATUS FAIL (open-write reason)
- Rubrics: inventory 98 · auth-coverage 66 · open-risk 0 · determinism 100

## Why a custom config is needed

Ghost wraps Express middleware behind a `mw.<name>` namespace
(`mw.authAdminApi`, `mw.authMemberApi`, `mw.publicAdminApi`, etc). ApiGate's
default `auth.express` list contains generic identifiers (`requireAuth`,
`passport.authenticate`, ...) — not project-specific names. With no
config, Ghost scores 0 GUARDED across the board.

This is the trust wedge in action: ApiGate doesn't pretend to recognize
patterns it hasn't been told about. Drop a one-line `.apigate.config.json`
extension, and the score becomes meaningful.

## What changed v0.2.x → v0.3.0 on this target

- Ghost wasn't in the v0.2.x dogfood lineup. This is its first scan.
- Default `auth.express` list unchanged in v0.3 (Ghost's patterns are too
  project-specific to ship as defaults).
- The v0.3 bidirectional NestJS scan does not apply here.

## What this run does NOT prove

- 99 OPEN endpoints includes both real public endpoints (e.g. RSS feeds,
  sitemaps) and false positives where Ghost uses a guard pattern the
  config doesn't capture. Triage via `--filter risk=HIGH,posture=OPEN`.
- 35 HIGH-risk endpoints are open write methods. Some are intentional
  (webhooks, public form submissions); others may be real exposure.
