# Security Policy

## Reporting a Vulnerability

If you find a security issue in ApiGate, please **do not open a public GitHub issue**. Instead, file a private [security advisory](https://github.com/Stelnyx/ApiGate/security/advisories/new) on the repository. Maintainers will respond within 5 business days with an acknowledgement and an initial assessment.

### What to include

- Affected version (`apigate --version`).
- A reproduction or test fixture if possible.
- The impact you observed (e.g., parser crash, false-positive that hides a real OPEN endpoint, path-traversal in config loading).

### What we treat as in-scope

- Bugs in `apigate.js` or `lib/*` that cause incorrect classification (a true OPEN endpoint reported as GUARDED is a security-relevant correctness bug).
- Resource exhaustion (DoS) against ApiGate by a maliciously crafted file in the scanned directory.
- Path traversal during config loading, output write, or fixture parsing.
- Any case where ApiGate makes a network call. ApiGate's contract is zero network — any path that violates this is a vulnerability.

### What we treat as out-of-scope

- The accuracy of static auth-posture classification at runtime (BOLA, IDOR, broken object-level authorization). ApiGate's report states this limitation explicitly — see [`README.md` → What this does NOT prove](README.md#what-this-does-not-prove). False negatives caused by the inherent limits of static analysis are not vulnerabilities; they are the documented trust contract.
- npm registry compromises of upstream dependencies (`acorn`, `acorn-walk`, `yaml`, `@stelnyx/report-theme`). These are addressed via lockfile pinning and `npm audit`; report upstream first.

## Supply-chain trust

- ApiGate is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) signed via GitHub Actions OIDC.
- The dependency surface is intentionally small: `@stelnyx/report-theme`, `acorn`, `acorn-walk`, `yaml`. Any addition requires explicit justification in the PR.
- Lockfile (`package-lock.json`) is committed and CI-verified.

## Coordinated disclosure

For high-severity issues we will:
1. Acknowledge receipt within 5 business days.
2. Confirm or reject the report within 14 days.
3. Ship a fix and publish a CVE / GHSA advisory within 30 days for confirmed reports, or sooner if exploitation is observed.
4. Credit the reporter in the advisory unless you request otherwise.

## No telemetry

ApiGate makes zero network calls at runtime. No usage data is sent anywhere. If you observe network activity originating from `apigate.js`, treat it as a vulnerability and file an advisory.
