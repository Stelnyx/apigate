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
    language: "js, mjs, cjs (AST) · ts, mts, cts (regex extractor — no full TS AST)",
    httpMethods: "get/post/put/delete/patch/head/options + fastify.route()",
    registerPrefixPropagation: false,
    routeOptionsParsed: true,
    preHandlerIdentifierExtraction: true,
    typeScriptAst: false,
    typeScriptGenericArguments: "skipped after the method name (fastify.delete<...>(...))"
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
    globalGuardDetection: true,
    globalGuardRules: "Detected in any scanned file: a provider object literal { provide: APP_GUARD, useClass: X } or { provide: APP_GUARD, useExisting: X } (any key order, no nested braces), and X.useGlobalGuards(new A(), new B()). Comments are ignored. The guard class names become auth markers of EVERY Nest endpoint in the scan (no per-module or per-app resolution), and an endpoint is GUARDED only if a class name matches auth.nest (JwtAuthGuard and AuthGuard by default); add your own guard name to auth.nest otherwise. Not detected: useFactory/useValue providers, guards passed as a variable to useGlobalGuards, RouterModule, versioning. ApiGate does not judge what a guard does.",
    globalPrefix: "X.setGlobalPrefix('literal') is applied to every Nest endpoint in the scan (quotes or a backtick string without interpolation). A non-literal argument, or two calls with different prefixes, makes all Nest endpoints unresolved (global-prefix-not-static-string). The literal exclude array is honored by exact match of the un-prefixed controller+method path, for strings and { path, method } entries (the method is not checked); a non-literal exclude, or a route pattern with parameters, is ignored and the prefix still applies.",
    publicDecorators: "config.publicDecorators (default Public, SkipAuth, AllowAnonymous), matched by name on the controller class or the method: the endpoint does not receive the global guard markers. Explicit markers on the same endpoint (for example @UseGuards) are kept.",
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
  "global-prefix-not-static-string",
  "method-or-url-missing",
  "method-path-not-static-string",
  "mount-prefix-not-static",
  "path-not-static-string",
  "route-opts-not-object-literal"
]);
