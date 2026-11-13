/**
 * Parser capability matrix — the honesty contract made machine-readable.
 *
 * Embedded into every JSON report and rendered in every HTML report so a
 * reviewer can see exactly what each parser does and does not resolve. This
 * is the static-analysis trust wedge: the report tells you its own blind
 * spots without you having to read the source.
 *
 * Frozen at v0.1.2. Changes here MUST bump apigate version + update
 * test/capabilities.mjs snapshot + reflect in the README "Parser Capabilities"
 * section. The matrix is sorted deterministically by parser name; do not
 * reorder.
 */
export const PARSER_CAPABILITIES = Object.freeze({
  express: Object.freeze({
    language: "js, mjs, cjs (AST) · ts, tsx (regex fallback)",
    httpMethods: "get/post/put/delete/patch/head/options/all",
    sameFileMountPrefix: true,
    crossFileMountPrefix: false,
    routerVariableTracking: "AST files: any same-file name assigned from express() / express.Router() / Router() (renamed imports included); the name heuristic (app, server, router, api, r, *router, *app) also applies, and is the only rule in the .ts/.tsx regex fallback",
    routeChains: "AST files: X.route(path).get(...).post(...) with per-method middleware; route(path).all(mw) is its own ALL endpoint and does not guard the other verbs of the chain; not in the .ts/.tsx regex fallback",
    routerLevelMiddleware: "AST files: path-less X.use(mw) adds markers to routes registered on X later, only when X is a const/let/var declared once from a router factory and never reassigned, the use() is an unconditional statement in the block that declares X, and the route is in that block outside nested functions; markers come from the direct argument or its callee only. Ignored (routes stay OPEN): this.router, parameters, use() inside if/loops/helper functions, X.use(<call or unknown>, mw), skip wrappers (.unless/.optional/.skip/...). Not propagated into routers mounted on X",
    dynamicMountPrefix: "UNRESOLVED",
    middlewareIdentifierExtraction: true,
    typeScriptAst: false
  }),
  fastify: Object.freeze({
    language: "js, mjs, cjs (AST only)",
    httpMethods: "get/post/put/delete/patch/head/options + fastify.route()",
    registerPrefixPropagation: false,
    routeOptionsParsed: true,
    preHandlerIdentifierExtraction: true,
    typeScriptAst: false
  }),
  nest: Object.freeze({
    language: "ts, tsx, js, mjs (regex extractor — no full TS AST)",
    httpMethods: "@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All",
    controllerStringArg: true,
    controllerObjectArg: "path field only (version segment ignored)",
    controllerArrayArg: "first path only",
    classLevelGuards: true,
    methodLevelGuards: true,
    methodDecoratorsBelowAnchor: true,
    multilineControllerArg: "PARTIAL — single-line and { path: '...' } object form resolve; complex multi-line @Controller args may block the upward scan above @Controller (deferred to v0.4)",
    globalGuardDetection: "NOT DETECTED — useGlobalGuards(...) / { provide: APP_GUARD } providers in main.ts / app.module.ts are invisible to per-controller parsing. Endpoints protected ONLY by a global guard will be reported OPEN. Workaround: extend auth.nest with your custom marker, or use config.severityOverrides to pin specific endpoints.",
    dynamicDecoratorArg: "UNRESOLVED"
  }),
  openapi: Object.freeze({
    language: "yaml, yml, json",
    specVersions: "OpenAPI 2.0 (swagger:) and 3.x (openapi:)",
    rootSecurity: true,
    operationSecurity: true,
    operationSecurityEmptyArray: "OPEN",
    missingSecurity: "UNKNOWN (conservative)",
    basePathOas2: true
  })
});

/**
 * Risk-tier rubric — exposed so consumers know what version of the ladder
 * produced the per-endpoint `risk` / `riskReason` fields. Bumped here
 * when the ladder, pattern set, or override mechanics change.
 */
export const RISK_TIER_INFO = Object.freeze({
  version: "v1",
  sensitivePathTokens: 9,
  buckets: ["HIGH", "MED", "LOW"],
  overrideHook: "config.severityOverrides"
});

/**
 * Standard set of unresolvedReason strings emitted by parsers. Used for the
 * summary.unknownReasons bucket sums. Any new reason added in a parser MUST
 * be appended here so the summary surfaces it deterministically.
 */
export const KNOWN_UNRESOLVED_REASONS = Object.freeze([
  "controller-path-not-static-string",
  "method-or-url-missing",
  "method-path-not-static-string",
  "mount-prefix-not-static",
  "path-not-static-string",
  "route-opts-not-object-literal"
]);
