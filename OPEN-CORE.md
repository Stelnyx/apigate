```text
░▒▓█ APIGATE · OPEN-CORE BOUNDARY █▓▒░
```

# Open-Core Boundary

This document defines what stays MIT-licensed and free in ApiGate forever, and what may become paid extensions in the future. It exists to be explicit **before** monetization happens, not after.

---

## OSS core — stays free, MIT-licensed, always

These capabilities are shipped today and will not move behind a paywall. **Every security-relevant signal — every endpoint, every posture, every drift, every disclosure — is free, in every report, forever.**

- **Endpoint enumeration** — Express, Fastify, NestJS, OpenAPI 2.0 / 3.x parsers. Every endpoint discovered is listed in every report.
- **Auth posture classification** — `GUARDED / OPEN / UNKNOWN` per endpoint, configurable identifier list per framework. Every open endpoint is named in every report.
- **Spec drift detection** — shadow / stale / authDrift buckets between code and OpenAPI specs. Every drift item is named in every report.
- **Intentional-public heuristic** — deterministic pattern list flagging common public-auth endpoints, fully overridable. Marked endpoints are still listed; the heuristic is advisory, never hides a finding.
- **Rubric scoring** — five 0–100 rubrics + headline mean, rule version pinned.
- **JSON report** — full schema, machine-readable, no proprietary fields, no scrubbed sections.
- **Self-contained HTML report** — rendered through `@stelnyx/report-theme`, zero external assets, dark/light theme, no telemetry.
- **"What this does NOT prove" disclosure** — printed in every report and will never be removed, hidden, or shortened. The honest-limitation statement is the product contract.
- **Exit-code gating** — the CI fail signal (`exit 1` on open writes) is core behavior, not a feature.
- **CLI** — `apigate`, `npx @stelnyx/apigate`.
- **Config file** — `.apigate.config.json`, per-framework auth identifiers, fail-on policy, public-auth pattern overrides.
- **Determinism guarantee** — byte-identical output across reruns, locked by `test/determinism.mjs`.
- **Local-only operation** — no required network calls, no telemetry, no account, fully air-gappable.

If you build on any of the above today, it will still be there and free in 18 months.

**The boundary:** paid tiers may add convenience, scale, persistence, branding, or workflow on top of the free findings. They **cannot** gate, redact, or paywall a finding the OSS report would otherwise show.

---

## Paid extensions — roadmap, not shipped

These do not exist. They are candidates for a future paid tier. **None of them remove, redact, or gate any finding (endpoint, posture, drift, disclosure) that the OSS report shows today.** Every candidate below adds convenience, scale, persistence, or workflow — never security signal.

| Candidate | What it would add | Why it does NOT gate a finding |
|-----------|-------------------|--------------------------------|
| Hosted dashboard | Web UI for viewing reports across runs without managing files locally | Same JSON. The CLI keeps emitting it. |
| Org-wide policy management | Centralized auth identifier lists + fail-on policies applied across multiple repos | Local `.apigate.config.json` keeps all the same knobs. |
| Multi-repo aggregation | Roll up endpoint inventories from many services, trend posture over time | Each repo still emits its own full report locally. |
| Compliance evidence packs | Pre-mapped endpoint exports for SOC 2 / ISO 27001 / PCI-DSS audits | Underlying findings come from the OSS JSON; the pack is presentation. |
| Additional framework parsers (paid) | Hapi, Koa, tRPC, GraphQL, Go (gin/chi), Python (FastAPI/Flask) | Express + Fastify + NestJS + OpenAPI stay OSS. New free parsers will continue to ship to OSS — paid parsers, if any, are net-new framework support, never a free-→-paid migration. |
| SSO / team access controls | SAML/OIDC login, RBAC for shared reports | Local CLI usage doesn't require accounts. |
| Audit log retention | Long-term hosted storage of scan history | The local JSON output is the source of truth. |
| Jira / Linear integration | Push open-endpoint findings as tickets, track remediation lifecycle | The findings exist in the free JSON; the integration is workflow. |
| SLA support | Response time guarantees, dedicated contact | Convenience, not signal. |

Building any of these requires revenue to justify. They will not ship as OSS because they require hosted infrastructure that costs money to run. If they ship, they will be priced transparently with a public self-hosted option where feasible.

---

## What this means for contributors

- PRs that extend the OSS core (new framework parsers, better resolution accuracy, additional rubric inputs, CLI flags, fixtures) are welcome and will stay MIT.
- PRs that build toward hosted infrastructure or multi-tenant features will be evaluated case by case. If a contribution materially enables a paid tier, that will be disclosed before merge.
- Contributors will not be asked to sign a CLA that would allow relicensing of the OSS core. The MIT license on the core is permanent.

---

## The test

Before adding any capability to the paid tier, the question is: **does this remove, redact, or gate a security signal the OSS report would otherwise show?** If yes, it's a rug-pull and will not happen. If it is net-new convenience, scale, persistence, branding, or workflow on top of findings the OSS CLI still emits, it is a fair extension.

The OSS CLI's exit code, JSON, HTML, and limitations disclosure are the immutable security contract. Everything paid is presentation around them.

---

*Last updated: 2026-05-19*
