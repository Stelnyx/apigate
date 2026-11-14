import { PARSER_CAPABILITIES, KNOWN_UNRESOLVED_REASONS } from "../lib/capabilities.mjs";
import { runner, assertEq } from "./_runner.mjs";

const t = runner("ApiGate · parser capabilities matrix");

t.test("PARSER_CAPABILITIES is frozen", () => {
  try { PARSER_CAPABILITIES.express = null; } catch (e) { return; }
  throw new Error("PARSER_CAPABILITIES should be frozen");
});

t.test("PARSER_CAPABILITIES.express child is frozen", () => {
  try { PARSER_CAPABILITIES.express.dynamicMountPrefix = "yes"; } catch (e) { return; }
  throw new Error("PARSER_CAPABILITIES.express should be frozen");
});

t.test("Express: declares regex TS fallback, no TS AST, dynamic mount UNRESOLVED", () => {
  const e = PARSER_CAPABILITIES.express;
  assertEq(e.sameFileMountPrefix, true);
  assertEq(e.crossFileMountPrefix, false);
  assertEq(e.dynamicMountPrefix, "UNRESOLVED");
  assertEq(e.typeScriptAst, false);
});

t.test("Express: router tracking, route() chains and router-level middleware are declared AST-only", () => {
  const e = PARSER_CAPABILITIES.express;
  for (const k of ["routerVariableTracking", "routeChains", "routerLevelMiddleware"]) {
    if (typeof e[k] !== "string" || !e[k].startsWith("AST files:")) throw new Error(`express.${k} missing or not AST-scoped`);
  }
});

t.test("Fastify: register prefix propagation is honestly false", () => {
  const f = PARSER_CAPABILITIES.fastify;
  assertEq(f.registerPrefixPropagation, false);
  assertEq(f.routeOptionsParsed, true);
  assertEq(f.typeScriptAst, false);
  if (!/ts/.test(f.language) || !f.typeScriptGenericArguments) throw new Error("fastify TS support not documented");
});

t.test("NestJS: controller object/array arg handling is documented", () => {
  const n = PARSER_CAPABILITIES.nest;
  assertEq(n.controllerStringArg, true);
  assertEq(n.classLevelGuards, true);
  assertEq(n.dynamicDecoratorArg, "UNRESOLVED");
});

t.test("OpenAPI: missing security is conservative UNKNOWN", () => {
  const o = PARSER_CAPABILITIES.openapi;
  assertEq(o.missingSecurity, "UNKNOWN (conservative)");
  assertEq(o.operationSecurityEmptyArray, "OPEN");
});

t.test("KNOWN_UNRESOLVED_REASONS is sorted, deduped, frozen", () => {
  const sorted = [...KNOWN_UNRESOLVED_REASONS].sort();
  assertEq(JSON.stringify(KNOWN_UNRESOLVED_REASONS), JSON.stringify(sorted));
  assertEq(new Set(KNOWN_UNRESOLVED_REASONS).size, KNOWN_UNRESOLVED_REASONS.length);
  try { KNOWN_UNRESOLVED_REASONS.push("x"); } catch (e) { return; }
  throw new Error("KNOWN_UNRESOLVED_REASONS should be frozen");
});

t.finish();
