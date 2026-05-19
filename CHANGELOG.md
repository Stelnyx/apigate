# Changelog

All notable changes to ApiGate are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-19

### Added
- **Static API surface audit.** ApiGate enumerates HTTP endpoints from
  Express, Fastify, NestJS, and OpenAPI 2.0 / 3.x specs. Reads source on
  disk only — zero HTTP requests, no credentials, no telemetry.
- **Auth posture classifier.** Per-endpoint `GUARDED / OPEN / UNKNOWN`
  classification based on static presence of declared auth identifiers.
  Configurable per framework via `.apigate.config.json`.
- **Spec drift detection.** When an OpenAPI/Swagger doc is present, ApiGate
  emits `shadow` (code-only), `stale` (spec-only), and `authDrift`
  (posture mismatch in either direction) buckets.
- **Five-rubric headline score.** `inventoryResolved`, `authCoverage`,
  `openEndpointRisk`, `specDrift`, `determinism`. Headline = arithmetic
  mean of non-null rubrics. Rule version pinned at `v1`.
- **HTML + JSON output via `@stelnyx/report-theme@^0.1.0`.** Same shell,
  tokens, and component primitives as SecGate / LuxScope / LuxFaber. No
  local renderer, no fork. Limitations section ("What this does NOT prove")
  rendered in every report as a printed trust feature.
- **Determinism contract test** (`test/determinism.mjs`): JSON and HTML
  byte-equality across two runs of the full pipeline against the sample
  fixture. Closes the class of silent flakes caused by Map iteration,
  Set ordering, or hidden clocks.
- **Golden snapshot test** (`test/golden-apigate.mjs`): hand-crafted
  multi-framework fixture; expected endpoint count, posture distribution,
  drift buckets, rubric values, and headline score are inline so any
  drift surfaces as a literal diff in code review.
- **report-theme contract test** (`test/report-theme-contract.mjs`):
  asserts every report is rendered through the shared theme shell
  (`class="shell"`, `<aside>`, `<main>`, exactly one `<!doctype>`) and
  that `lib/report.mjs` never emits its own HTML document. Backed by an
  ESLint rule (`no-restricted-syntax`) forbidding `<!doctype` literals
  anywhere outside the theme call path.
- **Sample report.** [`samples/realworld-express/`](samples/realworld-express/)
  ships the rendered report for the canonical
  [RealWorld backend](https://github.com/gothinkster/node-express-realworld-example-app)
  (`30b68e1e881462b2f4164ea09ab4c4f5699c7b0b`), vendored under
  `test/fixtures/realworld-express/`.

### Notes
- This is the initial release. Subsequent versions follow SemVer; the rubric
  formula is locked at `v1` and any change to the locked golden numbers
  must be intentional and reviewed.
