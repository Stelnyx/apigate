# Design parity with sister products

**Sisters:**
- [`SecGate`](https://github.com/Stelnyx/SecGate) (~/code/StelNyx/SecGate)
- [`luxfaber`](https://github.com/Stelnyx/LuxFaber) (~/code/StelNyx/luxfaber)
- [`luxscope`](https://github.com/Stelnyx/LuxScope) (~/code/StelNyx/luxscope)

ApiGate, SecGate, LuxScope, and LuxFaber share visual identity through a single npm package: **[`@stelnyx/report-theme`](https://github.com/Stelnyx/report-theme)**. **Drift is forbidden.** A change to the shared shell, theme tokens, brand block, or component primitives MUST happen in `report-theme` and be picked up here by version bump — never patched around locally.

## The report-theme consumption contract

ApiGate consumes `@stelnyx/report-theme@^0.1.0` (same pin as SecGate) with this exact import shape:

```js
// lib/report.mjs
import {
  shell as themeShell,
  scoreHero as themeScoreHero,
  kpiGrid as themeKpiGrid,
  bars as themeBars,
  findingsTable as themeFindingsTable,
} from "@stelnyx/report-theme";
```

The themeShell call envelope (brand / target / score / nav / bodyHtml / etc.) is a 1:1 mirror of [`SecGate/lib/report.mjs:522-542`](https://github.com/Stelnyx/SecGate/blob/main/lib/report.mjs) — only labels swapped.

**Forbidden:**
- Forking, vendoring, or copying any part of `report-theme`.
- Writing a parallel HTML renderer (inline `<!doctype>` strings outside the theme shell are blocked by ESLint).
- Inline `<style>` blocks that compete with or override theme tokens.
- Changing the dependency pin without coordinated SecGate / LuxScope / LuxFaber bumps.

**Enforcement:**
- `test/report-theme-contract.mjs` asserts every rendered report contains the theme's `class="shell"`, `<aside class="aside">`, `<main class="main">` markers and exactly one `<!doctype>`.
- `eslint.config.mjs` adds `no-restricted-syntax` rules blocking `<!doctype` literals outside `lib/report.mjs`'s shell-call assembly block.
- `test/determinism.mjs` asserts byte-identical JSON and HTML across two runs against the same fixture.

**If something is missing in the theme:** raise the gap as a proposed upstream change to `report-theme` in the PR description. Do not patch around it locally — drift compounds.

## Shared design tokens

All tokens come from `report-theme`'s `src/theme.css`. ApiGate does not redefine them. Reference values (Apple-derived dark palette):

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
| Shell builder       | `lib/report.mjs` → `renderHtml(rep, repoName)`                   |
| Theme dependency    | `@stelnyx/report-theme@^0.1.0` (same pin as SecGate)             |
| Class prefix        | none — ApiGate uses theme classes only; no `ag-` namespace yet   |
| Brand pill          | `"API REPORT"` (passed as `reportPill` to `shell()`)             |
| Status pill         | `"PASS"` / `"FAIL"` next to band — same convention as SecGate    |

## Sections (in display order)

1. **Overview** — headline scoreHero + KPI grid (Endpoints / Guarded / Open / Unknown / Shadow / Stale)
2. **Rubrics** — bars for the five 0–100 scores
3. **Endpoint inventory** — findingsTable with Method · Path · Framework · Posture · Location
4. **Spec drift** (conditional) — findingsTable with Kind · Method · Path · Note
5. **Limitations** — the "What this does NOT prove" section. **Always rendered. Never hidden.** This is the trust feature; removing it would defeat the product wedge.

## Rules

Same as SecGate / LuxFaber / LuxScope — touching the shell, theme tokens, score pill, or brand block means **opening a PR against `report-theme`** and waiting for the version bump. No local restyles. No "circle back later" patches. Drift compounds.
