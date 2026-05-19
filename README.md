<!-- markdownlint-disable MD033 MD041 -->

<div align="center">

# ApiGate

**A single-command static API surface audit.**

Express · Fastify · NestJS · OpenAPI 2/3
One command. One report. One exit code.

<p>
  <a href="https://www.npmjs.com/package/@stelnyx/apigate"><img alt="npm" src="https://img.shields.io/npm/v/@stelnyx/apigate.svg?style=flat-square&labelColor=0a0a0a&color=00cc66"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-00cc66.svg?style=flat-square&labelColor=0a0a0a"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-00cc66.svg?style=flat-square&labelColor=0a0a0a">
  <img alt="provenance" src="https://img.shields.io/badge/npm%20provenance-signed-00cc66.svg?style=flat-square&labelColor=0a0a0a">
  <a href="SECURITY.md"><img alt="security" src="https://img.shields.io/badge/security-policy-00cc66.svg?style=flat-square&labelColor=0a0a0a"></a>
  <a href="https://github.com/Stelnyx/ApiGate/actions/workflows/ci.yml"><img alt="self-scan" src="https://github.com/Stelnyx/ApiGate/actions/workflows/ci.yml/badge.svg?branch=main"></a>
</p>

</div>

---

**ApiGate** is the fourth surface in the Stelnyx line ([LuxScope](https://github.com/Stelnyx/LuxScope), [LuxFaber](https://github.com/Stelnyx/LuxFaber), [SecGate](https://github.com/Stelnyx/SecGate), **ApiGate**). It reads source code and OpenAPI specs on disk and produces one report: every endpoint, its declared auth posture, the drift between code and spec, scored against five 0–100 rubrics. **100% static** — no HTTP requests, no credentials, no running server. Zero network calls. Same input → byte-identical output.

**Honest positioning.** ApiGate is a **surface auditor**, not a runtime scanner and not a DAST tool. The report explicitly states what a static analysis CAN and CANNOT prove — it's a printed trust feature, not a footnote. ApiGate cannot verify runtime authorization (BOLA / object-level access). It can prove that an endpoint declares a guard. It cannot prove the guard is correct. See [What this does NOT prove](#what-this-does-not-prove).

**Status.** Early release (`v0.1.0`). Published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements). Report vulnerabilities via [SECURITY.md](SECURITY.md).

**Accuracy contract.** ApiGate's parsing + scoring pipeline is deterministic — same inputs produce JSON- and HTML-byte-identical reports across every run. Three test suites lock the contract:

- `test/determinism.mjs` — byte-equality of JSON and HTML across reruns of every parser, classifier, diff, score, and renderer call.
- `test/golden-apigate.mjs` — hand-crafted multi-framework fixture; expected endpoint count, posture distribution, drift buckets, and headline score are inline so any change surfaces in code review.
- `test/report-theme-contract.mjs` — asserts the HTML report is rendered through `@stelnyx/report-theme`, not by a parallel local renderer.

---

## Headline Score

Every run produces a **Headline Score (0–100)** alongside the binary PASS/FAIL gate. The score is the arithmetic mean of five 0–100 rubrics:

```
Headline:  86 / 100   █████████████████░░░   STRONG  rubric v1

  Inventory         86 / 100   █████████████████░░░
  Auth Coverage     67 / 100   █████████████░░░░░░░
  Open Risk         85 / 100   █████████████████░░░
  Spec Drift        90 / 100   ██████████████████░░
  Determinism      100 / 100   ████████████████████
```

| Rubric              | What it measures                                                                                       |
|---------------------|--------------------------------------------------------------------------------------------------------|
| **Inventory Resolved** | `100 × resolved / total`. Routes mounted via dynamic prefixes drag this down — never silently dropped. |
| **Auth Coverage**      | `100 × guarded / (guarded + open)`. UNKNOWNs excluded from the denominator.                            |
| **Open Endpoint Risk** | Starts at 100. Open write methods (POST/PUT/PATCH/DELETE) `-12` each; open GETs `-3` each. Floor 0.    |
| **Spec Drift**         | Starts at 100. Shadow `-5`, stale `-5`, auth-drift `-10` each. `null` (excluded from mean) when no spec found. |
| **Determinism**        | Locked at 100 in v0.1. The byte-equality test is what actually enforces it.                            |

Bands: `STRONG ≥ 85`, `GOOD ≥ 70`, `MIXED ≥ 50`, `WEAK < 50`. Same bands as SecGate / LuxFaber / LuxScope.

The binary gate (exit 1 on open write methods, configurable) is independent of the score. `headlineScore` + `rubrics` are written to `apigate-v7-report.json` for CI dashboards and trend tracking.

---

## TL;DR

```bash
npx @stelnyx/apigate .
```

Inventories every HTTP endpoint, classifies auth posture, diffs against any OpenAPI spec, writes a JSON report + a self-contained HTML report. Exit `0` on clean, `1` on open-write endpoints (default policy). That's the whole product.

---

## What it does today

ApiGate walks source files in a directory and produces:

- **One normalized JSON report** — every endpoint, posture, drift bucket, rubric, headline
- **One self-contained HTML report** — rendered through `@stelnyx/report-theme`; visually + structurally identical to SecGate / LuxScope / LuxFaber reports
- **One exit code** — `1` on open-write endpoints (configurable); blocks CI

ApiGate does not run code. It does not send HTTP requests. It does not require credentials or a running server. Everything happens at parse-time against source files.

---

## Frameworks

| Framework  | Detection                                                                                                                |
|------------|--------------------------------------------------------------------------------------------------------------------------|
| **Express**  | acorn AST for `.js/.mjs/.cjs`; regex fallback for `.ts/.tsx`. Resolves `app.use('/prefix', router)` mounts in same file. |
| **Fastify**  | acorn AST. Handles `fastify.<method>(...)` and `fastify.route({ method, url, preHandler })`.                             |
| **NestJS**   | Decorator extraction over `.ts/.js`. Pairs `@Controller(...)` with method decorators `@Get / @Post / @Put / @Patch / @Delete / @Options / @Head / @All`. Captures class- and method-level guards (`@UseGuards`, `@Auth`, `@Roles`, `@ApiBearerAuth`). |
| **OpenAPI**  | Parses `*.yaml`/`*.yml`/`*.json` with `swagger:` (2.0) or `openapi:` (3.x) root. Honors operation-level `security` and root inheritance. |

Routes that can't be statically resolved (dynamic mount prefixes, computed method names, unparseable files) are emitted as `UNRESOLVED` — never guessed. They count against the **Inventory Resolved** rubric so the report tells you what ApiGate could and couldn't see.

---

## Network access

ApiGate makes **zero** network calls. No telemetry, no account, no phone-home, no advisory database, no spec fetching from URLs. Reports are written to local files only. Code never leaves your machine.

This is unconditional, not a flag. Air-gapped CI works as well as a developer laptop.

---

## What this does NOT prove

The honesty wedge of ApiGate. The report renders this section in every run, never hidden behind a toggle:

1. **Static analysis cannot verify runtime authorization (BOLA / object-level access).** ApiGate only inspects declared auth posture, not the correctness of the auth middleware itself.
2. An endpoint with a declared auth identifier in its middleware chain is classified `GUARDED` — the middleware may still be misconfigured, bypassable, or insecure at runtime.
3. Routes mounted via dynamic strings (computed prefixes, runtime registration, factory functions) are reported as `UNRESOLVED` rather than guessed.
4. ApiGate makes zero network calls. It does not send code, telemetry, or scan artifacts anywhere.

If you need runtime authorization testing (BOLA, IDOR, broken object-level auth), use a dynamic scanner. ApiGate complements DAST tooling; it does not replace it.

---

## Install

### From npm (recommended)

```bash
npm install -g @stelnyx/apigate
```

### One-shot via npx

```bash
npx @stelnyx/apigate .
```

### From source

```bash
git clone https://github.com/Stelnyx/ApiGate.git
cd ApiGate
npm install
chmod +x apigate.js
sudo ln -sf "$(pwd)/apigate.js" /usr/local/bin/apigate
```

---

## Usage

```bash
# Scan current directory
apigate .

# Scan a specific path
apigate /path/to/project

# Write reports to a custom directory
apigate /path/to/project --output-dir /tmp/reports

# Strip absolute paths (auto-on when CI=true)
apigate /path/to/project --strip-paths

# JSON only / HTML only
apigate . --format json
apigate . --format html

# Show parser warnings
apigate . --debug

# Version / help
apigate --version
apigate --help
```

**Exit codes**

| Code | Meaning                                                          |
|:----:|------------------------------------------------------------------|
| `0`  | PASS — no findings above configured failOn threshold             |
| `1`  | FAIL — open write endpoint (default), or drift (when enabled)    |
| `2`  | Invalid target or CLI error                                      |

---

## Configuration

Create `.apigate.config.json` in your scan target directory. All fields optional.

```json
{
  "frameworks": {
    "express": true, "fastify": true, "nest": true, "openapi": true
  },
  "auth": {
    "express":  ["requireAuth", "passport.authenticate", "jwt"],
    "fastify":  ["onRequest", "preHandler", "fastify.authenticate"],
    "nest":     ["UseGuards", "AuthGuard", "JwtAuthGuard"]
  },
  "failOn": {
    "openWriteMethods": true,
    "openReadMethods":  false,
    "drift":            false
  },
  "excludePaths": ["node_modules/**", "dist/**", "**/*.test.*"]
}
```

A fully-commented example config lives at [`.apigate.config.example.json`](.apigate.config.example.json) — copy into your repo as `.apigate.config.json` and edit.

### Field reference

| Field         | Type    | Default                                | Description                                                                 |
|---------------|---------|----------------------------------------|-----------------------------------------------------------------------------|
| `frameworks`  | object  | all `true`                             | Toggle individual parsers                                                  |
| `auth`        | object  | per-framework defaults                 | Identifier names that classify an endpoint as `GUARDED` when present       |
| `failOn`      | object  | `{ openWriteMethods: true, drift: false }` | Exit-code policy                                                       |
| `excludePaths`| array   | `node_modules/`, `dist/`, test dirs    | Globs of files to skip                                                     |

### Precedence

```
CLI flag  >  .apigate.config.json  >  built-in defaults
```

Missing config: silent, defaults apply. Invalid JSON: error logged, defaults apply.

### Auth identifier configuration

ApiGate's classifier reports `GUARDED` when one of the declared auth identifiers appears in the endpoint's middleware/decorator chain. The defaults cover the common framework idioms (`passport.authenticate`, `@UseGuards`, Fastify `preHandler`). For project-specific helpers (e.g., a custom `requireOrg` middleware), extend the list:

```json
{ "auth": { "express": ["requireAuth", "requireOrg", "requireBilling"] } }
```

ApiGate does **not** inspect what these identifiers do at runtime. Their declared presence is the signal — that's the static-analysis honesty contract.

---

## Sample report

A live sample lives at [`samples/realworld-express/`](samples/realworld-express/) — ApiGate's report for the canonical [RealWorld backend](https://github.com/gothinkster/node-express-realworld-example-app) (vendored at a pinned commit under `test/fixtures/realworld-express/`).

```
Headline: 90 / 100  STRONG       rubric v1
  Inventory       100 / 100
  Auth Coverage    85 / 100
  Open Risk        73 / 100
  Spec Drift      n/a / 100
  Determinism     100 / 100

20 endpoints discovered (17 guarded · 3 open · 0 unknown)
```

The 3 open endpoints are sign-up / login / refresh — intentionally public.
ApiGate fails the gate on them under the default `openWriteMethods: true` policy; the project would either accept the FAIL as design intent or relax the policy.

---

## CI / CD

### GitHub Actions — minimal

```yaml
- name: Run ApiGate
  run: npx @stelnyx/apigate .
  # exits 1 on open write endpoints by default — blocks the pipeline
```

### Non-blocking (report only)

```yaml
- name: Run ApiGate
  run: npx @stelnyx/apigate . || true

- name: Upload report
  uses: actions/upload-artifact@v4
  with:
    name: apigate-report
    path: |
      apigate-v7-report.json
      *.html
```

---

## Report output

Each run writes:

- **`apigate-v7-report.json`** — machine-readable, schema below
- **`<repo-name>.html`** — self-contained HTML report (rendered through `@stelnyx/report-theme`)

### JSON schema

```json
{
  "version": "0.1.0",
  "rubricVersion": "v1",
  "timestamp": "ISO 8601",
  "target": "/absolute/path or repo basename",
  "mode": "static",
  "status": "PASS | FAIL",
  "headlineScore": 86,
  "rubrics": {
    "inventoryResolved": 86,
    "authCoverage": 67,
    "openEndpointRisk": 85,
    "specDrift": 90,
    "determinism": 100
  },
  "summary": {
    "endpoints": 7, "resolved": 6, "unresolved": 1,
    "guarded": 4, "open": 2, "unknown": 1,
    "specEndpoints": 6, "shadow": 1, "stale": 1, "authDrift": 0
  },
  "endpoints": [
    {
      "method": "GET | POST | PUT | PATCH | DELETE | OPTIONS | HEAD | ALL",
      "path":   "/users/:id",
      "file":   "src/server.js",
      "line":   42,
      "framework": "express | fastify | nest | openapi",
      "resolved": true,
      "posture":  "GUARDED | OPEN | UNKNOWN",
      "authMarkers": ["requireAuth"],
      "unresolvedReason": null
    }
  ],
  "drift": {
    "shadow":    [{ "kind": "shadow",  "method": "POST", "path": "/x", "note": "..." }],
    "stale":     [{ "kind": "stale",   "method": "GET",  "path": "/y", "note": "..." }],
    "authDrift": [{ "kind": "authDriftDeclaredOnly", "method": "PUT", "path": "/z", "note": "..." }]
  },
  "frameworksDetected": ["express", "openapi"],
  "specsDetected": ["openapi.yaml"],
  "warnings": [],
  "limitations": ["..."]
}
```

### Posture tiers

| Posture     | Meaning                                                                                  |
|-------------|------------------------------------------------------------------------------------------|
| **GUARDED** | At least one declared auth identifier present in the endpoint's middleware/decorator chain |
| **OPEN**    | Endpoint resolved, no auth identifier present                                            |
| **UNKNOWN** | Endpoint itself is unresolved, OR (specs) no security block present                      |

---

## Design parity

ApiGate is visually + structurally indistinguishable from SecGate, LuxScope, and LuxFaber. The HTML report is rendered through `@stelnyx/report-theme@^0.1.0` — the same version, same imports, same shell envelope, no fork, no local restyle. See [DESIGN_PARITY.md](DESIGN_PARITY.md) for the contract.

If a missing theme component blocks ApiGate, the resolution is an upstream PR to `report-theme`, not a local patch. That's how the four-tool shelf stays one product.

---

## Documentation

| Doc                                                    | What's in it                                                                   |
|--------------------------------------------------------|--------------------------------------------------------------------------------|
| [`CHANGELOG.md`](CHANGELOG.md)                         | Version history — Added / Changed / Fixed per release                          |
| [`OPEN-CORE.md`](OPEN-CORE.md)                         | OSS core boundary and paid extension roadmap                                   |
| [`DESIGN_PARITY.md`](DESIGN_PARITY.md)                 | The report-theme consumption contract                                          |
| [`SECURITY.md`](SECURITY.md)                           | Vulnerability reporting, SLA, coordinated disclosure                           |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                   | Dev setup, branch + commit conventions, PR checklist                           |

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Report vulnerabilities privately per [`SECURITY.md`](SECURITY.md) — **do not open public issues for security reports**.

---

## License

[MIT](LICENSE) — © Stelnyx
