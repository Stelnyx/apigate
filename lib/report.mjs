import {
  shell as themeShell,
  scoreHero as themeScoreHero,
  kpiGrid as themeKpiGrid,
  bars as themeBars,
  findingsTable as themeFindingsTable,
} from "@stelnyx/report-theme";
import { bandFromScore } from "./score.mjs";

/**
 * The static-analysis honesty contract. Rendered in every report, never
 * hidden behind a toggle. This is the wedge of ApiGate: the report is
 * trustworthy because it tells you what it can't see.
 */
export const LIMITATIONS = Object.freeze([
  "Static analysis cannot verify runtime authorization (BOLA / object-level access). ApiGate only inspects declared auth posture, not the correctness of the auth middleware itself.",
  "An endpoint with a declared auth identifier in its middleware chain is classified GUARDED — the middleware may still be misconfigured, bypassable, or insecure at runtime.",
  "Routes mounted via dynamic strings (computed prefixes, runtime registration, factory functions) are reported as UNRESOLVED rather than guessed.",
  "ApiGate makes ZERO network calls. It does not send code, telemetry, or scan artifacts anywhere. Reports are written to local files only."
]);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function postureTone(p) {
  if (p === "GUARDED") return "low";
  if (p === "OPEN") return "high";
  return "med";
}

function methodTone(m) {
  const write = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  return write ? "high" : "low";
}

function locationCell(e) {
  if (!e.file) return '<span style="color:var(--faint)">—</span>';
  const line = e.line ? `:${e.line}` : "";
  return `<code>${escapeHtml(e.file + line)}</code>`;
}

function rubricBars(rubrics) {
  const labels = {
    inventoryResolved: "Inventory Resolved",
    authCoverage: "Auth Coverage",
    openEndpointRisk: "Open Endpoint Risk",
    specDrift: "Spec Drift",
    determinism: "Determinism"
  };
  const items = [];
  for (const key of ["inventoryResolved", "authCoverage", "openEndpointRisk", "specDrift", "determinism"]) {
    const val = rubrics[key];
    if (val === null || val === undefined) {
      items.push({ name: labels[key], score: "n/a", pct: 0, weight: "no spec", tone: "med" });
    } else {
      const tone = val >= 85 ? "default" : val >= 50 ? "med" : "warn";
      items.push({ name: labels[key], score: `${val}`, pct: val, weight: "", tone });
    }
  }
  return themeBars(items);
}

function limitationsSection() {
  const lis = LIMITATIONS.map(l => `<li style="margin-bottom:8px">${escapeHtml(l)}</li>`).join("");
  return `<section id="limitations" style="padding:18px 20px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-top:12px">
    <h2 style="margin-top:0">What this does NOT prove</h2>
    <p style="color:var(--muted);font-size:13px;margin-top:4px">
      ApiGate is a deterministic, static surface auditor. The points below are not footnotes — they are the contract of what a static report can and cannot tell you. Read them every time.
    </p>
    <ol style="color:var(--text);font-size:13px;line-height:1.7;padding-left:20px;margin-top:12px">${lis}</ol>
  </section>`;
}

function endpointTable(endpoints) {
  if (!endpoints.length) {
    return `<p style="color:var(--faint);font-size:13px">No endpoints discovered.</p>`;
  }
  const rows = endpoints.map(e => ({
    severity: { label: e.method, tone: methodTone(e.method) },
    cells: [
      e.resolved !== false ? `<code>${escapeHtml(e.path || "")}</code>` : `<code style="color:var(--warn)">UNRESOLVED</code>`,
      escapeHtml(e.framework),
      `<span class="pill ${postureTone(e.posture)}">${escapeHtml(e.posture)}</span>`,
      locationCell(e)
    ]
  }));
  return themeFindingsTable({
    columns: ["Method", "Path", "Framework", "Posture", "Location"],
    rows
  });
}

function driftTable(drift) {
  const all = [
    ...(drift.shadow || []).map(d => ({ ...d, label: "Shadow" })),
    ...(drift.stale || []).map(d => ({ ...d, label: "Stale" })),
    ...(drift.authDrift || []).map(d => ({ ...d, label: d.kind === "authDriftDeclaredOnly" ? "Auth drift (code open)" : "Auth drift (code guarded)" }))
  ];
  if (!all.length) {
    return `<p style="color:var(--faint);font-size:13px">No spec drift detected.</p>`;
  }
  const rows = all.map(d => ({
    severity: { label: d.label, tone: d.kind === "stale" ? "med" : "high" },
    cells: [
      escapeHtml(d.method || ""),
      `<code>${escapeHtml(d.path || "")}</code>`,
      escapeHtml(d.note || "")
    ]
  }));
  return themeFindingsTable({
    columns: ["Kind", "Method", "Path", "Note"],
    rows
  });
}

/**
 * Render the full ApiGate HTML report by composing report-theme primitives.
 * The shell, sidebar chrome, fonts, colors, and dark/light tokens all come
 * from @stelnyx/report-theme — ApiGate never emits its own HTML document.
 */
export function renderHtml(rep, targetLabel) {
  const headline = rep.headlineScore ?? 0;
  const band = bandFromScore(headline);
  const status = rep.status;
  const sum = rep.summary;
  const specPresent = (rep.specsDetected || []).length > 0;

  const heroDesc = "ApiGate inventories every HTTP endpoint, classifies auth posture (GUARDED / OPEN / UNKNOWN), and diffs the surface against any declared OpenAPI spec. 100% static — no network, no credentials, deterministic.";

  const navItems = [
    { id: "overview", label: "Overview", active: true },
    { id: "rubrics", label: "Rubrics", count: 5 },
    { id: "endpoints", label: "Endpoints", count: rep.endpoints.length },
    ...(specPresent ? [{ id: "drift", label: "Spec drift", count: (rep.drift.shadow?.length || 0) + (rep.drift.stale?.length || 0) + (rep.drift.authDrift?.length || 0) }] : []),
    { id: "limitations", label: "Limitations" }
  ];

  const kpis = [
    { label: "Endpoints", value: sum.endpoints },
    { label: "Guarded", value: sum.guarded, tone: "low" },
    { label: "Open", value: sum.open, tone: sum.open > 0 ? "high" : "low" },
    { label: "Unknown", value: sum.unknown, tone: "med" },
    { label: "Shadow", value: sum.shadow, tone: sum.shadow > 0 ? "med" : "low" },
    { label: "Stale", value: sum.stale, tone: sum.stale > 0 ? "med" : "low" }
  ];

  const bodyHtml = `
    <section id="overview">
      <h1>API surface <span class="lead">${escapeHtml(rep.endpoints.length)} endpoints · ${escapeHtml((rep.frameworksDetected || []).join(", ") || "no framework detected")}</span></h1>
      ${themeScoreHero({
        label: "Headline",
        num: headline,
        denom: `/ 100  ${band}`,
        sub: `${sum.guarded} guarded · ${sum.open} open · ${sum.unknown} unknown · status ${status}`,
        fillPct: headline,
        fillColor: status === "PASS" ? "success" : "warn",
        desc: heroDesc
      })}
      ${themeKpiGrid(kpis)}
    </section>

    <section id="rubrics">
      <h2>Rubrics <span class="lead">five 0–100 scores · headline = arithmetic mean of non-null rubrics</span></h2>
      ${rubricBars(rep.rubrics)}
    </section>

    <section id="endpoints">
      <h2>Endpoint inventory <span class="lead">${escapeHtml(rep.endpoints.length)} discovered · sorted method/path</span></h2>
      ${endpointTable(rep.endpoints)}
    </section>

    ${specPresent ? `<section id="drift">
      <h2>Spec drift <span class="lead">${escapeHtml((rep.specsDetected || []).join(", "))}</span></h2>
      ${driftTable(rep.drift || {})}
    </section>` : ""}

    ${limitationsSection()}
  `;

  return themeShell({
    brand: "APIGATE",
    target: targetLabel || rep.target || "",
    meta: `v${rep.version} · rubric v1`,
    tier: { label: status, tone: status === "PASS" ? "pass" : "warn" },
    product: "ApiGate Report",
    score: {
      num: headline,
      denom: "/ 100",
      badge: { label: status, tone: status === "PASS" ? "pass" : "warn" }
    },
    reportType: `API · ${band}`,
    reportTypeFooter: "API Surface Report",
    reportPill: "API REPORT",
    navLabel: "Report",
    nav: navItems,
    bodyHtml,
    title: `ApiGate Report — ${targetLabel || rep.target || "scan"}`,
    reportVersion: `v${rep.version}`,
    generatedAt: rep.timestamp
  });
}
