```text
░▒▓█ APIGATE · OPEN-CORE BOUNDARY █▓▒░
```

# Open-Core Boundary

This document defines what stays MIT-licensed and free in ApiGate forever, and what may become paid extensions in the future. It exists to be explicit **before** monetization happens, not after.

---

## OSS core — stays free, MIT-licensed, always

These capabilities are shipped today and will not move behind a paywall:

- **Endpoint enumeration** — Express, Fastify, NestJS, OpenAPI 2.0 / 3.x parsers
- **Auth posture classification** — `GUARDED / OPEN / UNKNOWN` per endpoint, configurable identifier list per framework
- **Spec drift detection** — shadow / stale / authDrift buckets between code and OpenAPI specs
- **Rubric scoring** — five 0–100 rubrics + headline mean, rule version pinned
- **JSON report** — full schema, machine-readable, no proprietary fields
- **Self-contained HTML report** — rendered through `@stelnyx/report-theme`, zero external assets, dark/light theme, no telemetry
- **Limitations callout** — the printed "what this does NOT prove" section is part of the product contract and will never be removed or hidden
- **CLI** — `apigate`, `npx @stelnyx/apigate`, exit-code semantics for CI gating
- **Config file** — `.apigate.config.json`, per-framework auth identifiers, fail-on policy
- **Determinism guarantee** — byte-identical output across reruns, locked by `test/determinism.mjs`
- **Local-only operation** — no required network calls, no telemetry, no account, fully air-gappable

If you build on any of the above today, it will still be there and free in 18 months.

---

## Paid extensions — roadmap, not shipped

These do not exist. They are candidates for a future paid tier. None of them remove or gate features that are free today.

| Candidate | What it would add |
|-----------|-------------------|
| Hosted dashboard | Web UI for viewing reports across runs without managing files locally |
| Org-wide policy management | Centralized auth identifier lists and fail-on policies applied across multiple repos |
| Multi-repo aggregation | Aggregate endpoint inventories from many services into one view, trend over time |
| Compliance evidence packs | Mapped endpoint exports for SOC 2, ISO 27001, PCI-DSS audit trails |
| Additional framework parsers | Hapi, Koa, tRPC, GraphQL, Go (gin/chi), Python (FastAPI / Flask) — current scope is JS/TS only |
| SSO / team access controls | SAML/OIDC login, role-based access to reports |
| Audit log retention | Long-term storage of scan history and posture trends |
| Jira / Linear integration | Push open-endpoint findings as tickets, track remediation lifecycle |
| SLA support | Response time guarantees, dedicated contact |

Building any of these requires revenue to justify. They will not ship as OSS because they require hosted infrastructure that costs money to run. If they ship, they will be priced transparently with a public self-hosted option where feasible.

---

## What this means for contributors

- PRs that extend the OSS core (new framework parsers, better resolution accuracy, additional rubric inputs, CLI flags, fixtures) are welcome and will stay MIT.
- PRs that build toward hosted infrastructure or multi-tenant features will be evaluated case by case. If a contribution materially enables a paid tier, that will be disclosed before merge.
- Contributors will not be asked to sign a CLA that would allow relicensing of the OSS core. The MIT license on the core is permanent.

---

## The test

Before adding any capability to the paid tier, the question is: does this remove something that currently exists for free? If yes, that is a rug-pull and will not happen. If it is a net-new capability that requires hosted infrastructure, it is a fair extension.

---

*Last updated: 2026-05-19*
