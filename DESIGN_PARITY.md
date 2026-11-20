# Design parity with sister products

**Sisters:**
- [`SecGate`](https://github.com/Stelnyx/SecGate)
- [`luxfaber`](https://stelnyx.com/)
- [`luxscope`](https://stelnyx.com/)

ApiGate, SecGate, LuxScope, and LuxFaber share visual identity through a single npm package: **[`@stelnyx/report-theme`](https://www.npmjs.com/package/@stelnyx/report-theme)**. **Drift is forbidden.** A change to the shared shell, theme tokens, brand block, or component primitives MUST happen in `report-theme` and reach ApiGate through a version bump. Do not patch around it locally.

## The report-theme consumption contract

ApiGate consumes `@stelnyx/report-theme@^0.1.4` (the range in `package.json`) with this import shape:

```js
// lib/report.mjs
import {
  shell as themeShell,
  scoreHero as themeScoreHero,
  kpiGrid as themeKpiGrid,
  bars as themeBars,
  findingsTable as themeFindingsTable,
  FAVICON_WHITE,
} from "@stelnyx/report-theme";
```

The `themeShell` call passes brand, target, meta, favicon, score, report labels, nav and `bodyHtml`, following the same envelope SecGate uses with ApiGate labels.

**Forbidden:**
- Forking, vendoring, or copying any part of `report-theme`.
- Writing a parallel HTML renderer (inline `<!doctype>` strings in any `.js`/`.mjs` file other than `lib/report.mjs` are blocked by ESLint).
- Inline `<style>` blocks that compete with or override theme tokens. `lib/report.mjs` uses a few inline `style` attributes for layout, and they reference theme variables such as `var(--muted)`.
- Changing the dependency range without coordinated SecGate / LuxScope / LuxFaber bumps.

**Enforcement:**
- `test/report-theme-contract.mjs` asserts every rendered report contains the theme's `class="shell"`, `<aside class="aside">`, `<main class="main">` markers, exactly one `<!doctype>`, and no `<script src=...>`.
- `eslint.config.mjs` adds `no-restricted-syntax` rules that block `<!doctype` literals in every `.js`/`.mjs` file except `lib/report.mjs`, `test/report-theme-contract.mjs` and `eslint.config.mjs`.
- `test/determinism.mjs` asserts byte-identical JSON and HTML across two runs against the same fixture.

**If something is missing in the theme:** raise the gap as a proposed upstream change to `report-theme` in the PR description. Do not patch around it locally, because drift compounds.

## External requests from the HTML report

The scan itself makes no network calls. The HTML report is a single file with inlined CSS and script, but it is not free of external requests: the theme shell adds `<link>` tags for the Inter font from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`), so a browser that opens the report requests those URLs. `lib/report.mjs` does not pass the theme's `skipInterFont` option. Offline, the browser falls back to the system fonts in `--font`.

## Shared design tokens

All tokens come from `report-theme`'s `src/theme.css`. ApiGate does not redefine them. The theme ships one dark palette; there is no light theme or theme toggle. Reference values:

| Token            | Dark      | Notes                               |
|------------------|-----------|-------------------------------------|
| `--bg`           | `#0a0a0a` | page background                     |
| `--surface`      | `#141414` | card / section background           |
| `--border`       | `#1f1f1f` | low-contrast separators             |
| `--text`         | `#e5e5e7` | primary text                        |
| `--muted`        | `#a3a3a8` | secondary text (WCAG-compliant)     |
| `--success`      | `#34c759` | pass / guarded                      |
| `--warn`         | `#ff9500` | mixed / open                        |
| `--error`        | `#ff3b30` | fail / critical                     |
| `--pink`         | `#ff2d78` | Stelnyx brand accent                |

Score bands (shared with SecGate / LuxFaber): `STRONG ≥85`, `GOOD ≥70`, `MIXED ≥50`, `WEAK <50`.

## ApiGate-specific facts

| What                | Value                                                            |
|---------------------|------------------------------------------------------------------|
| Shell builder       | `lib/report.mjs` → `renderHtml(rep, targetLabel)`                |
| Theme dependency    | `@stelnyx/report-theme@^0.1.4`                                   |
| Class prefix        | none. ApiGate uses theme classes only; no `ag-` namespace yet    |
| Brand pill          | `"API REPORT"` (passed as `reportPill` to `shell()`)             |
| Status badge        | `PASS`, `FAIL` or `NOTHING_ANALYSED` on the score, next to the band |

## Sections (in display order)

The sidebar nav links to each section. All sections are on one page; there are no tabs.

1. **Overview**: scoreHero plus a KPI grid (Endpoints / HIGH risk / MED risk / Guarded / Open / Unknown / Shadow / Stale).
2. **PR changes** (only with `--diff`): added, removed and changed endpoints against the ref.
3. **Gate** (only when the gate has reasons): why the gate failed.
4. **Endpoint inventory**: findingsTable with Method · Path · Framework · Risk · Posture · Marker / Reason · Location, plus a text filter and click-to-sort headers.
5. **Spec drift** (only when a spec is found): findingsTable with Kind · Method · Path · Note.
6. **Rubrics**: bars for the five 0–100 scores.
7. **Unknown reasons** (only when `summary.unknownReasons` has entries): Count · Reason · Detail.
8. **Parser capabilities**: Parser · Capability · Behavior.
9. **Limitations**: the "What this does NOT prove" section. **Always rendered. Never hidden.** This is the trust feature; removing it would defeat the product wedge.

## Rules

Same as SecGate / LuxFaber / LuxScope: touching the shell, theme tokens, score pill, or brand block means **opening a PR against `report-theme`** and waiting for the version bump. No local restyles and no "circle back later" patches.
