import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { loadConfig, defaultConfig } from "../lib/config.mjs";
import { runner, assertEq } from "./_runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const t = runner("ApiGate · config");

t.test("loads defaults when no file present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-cfg-"));
  const cfg = loadConfig(dir);
  assertEq(cfg.frameworks.express, true);
  assertEq(cfg.failOn.openWriteMethods, true);
  assertEq(cfg.failOn.openReadMethods, false);
  assertEq(cfg.failOn.unknown, false);
  assertEq(cfg.requireSpec, false);
  assertEq(cfg.strictPublic, false);
});

t.test("merges file overrides over defaults", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-cfg-"));
  fs.writeFileSync(path.join(dir, ".apigate.config.json"), JSON.stringify({
    frameworks: { fastify: false },
    failOn: { openReadMethods: true, unknown: true },
    requireSpec: true,
    strictPublic: true
  }));
  const cfg = loadConfig(dir);
  assertEq(cfg.frameworks.fastify, false);
  assertEq(cfg.frameworks.express, true);
  assertEq(cfg.failOn.openReadMethods, true);
  assertEq(cfg.failOn.openWriteMethods, true);
  assertEq(cfg.failOn.unknown, true);
  assertEq(cfg.requireSpec, true);
  assertEq(cfg.strictPublic, true);
});

t.test("falls back to defaults on invalid JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-cfg-"));
  fs.writeFileSync(path.join(dir, ".apigate.config.json"), "{not json");
  const cfg = loadConfig(dir);
  assertEq(cfg.frameworks.express, true);
});

t.test("defaultConfig() returns plain object suitable for mutation", () => {
  const cfg = defaultConfig();
  cfg.frameworks.express = false;
  assertEq(cfg.frameworks.express, false);
  // a second call returns a fresh copy
  const cfg2 = defaultConfig();
  assertEq(cfg2.frameworks.express, true);
});

t.test("publicDecorators: default, custom list with @ stripped, [] and invalid value", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apigate-cfg-"));
  const cfgFile = path.join(dir, ".apigate.config.json");
  const def = ["Public", "SkipAuth", "AllowAnonymous"];
  assertEq(JSON.stringify(defaultConfig().publicDecorators), JSON.stringify(def));
  fs.writeFileSync(cfgFile, "{}");
  assertEq(JSON.stringify(loadConfig(dir).publicDecorators), JSON.stringify(def));
  fs.writeFileSync(cfgFile, JSON.stringify({ publicDecorators: ["@Open", " NoAuth ", 3, ""] }));
  assertEq(JSON.stringify(loadConfig(dir).publicDecorators), JSON.stringify(["Open", "NoAuth"]));
  fs.writeFileSync(cfgFile, JSON.stringify({ publicDecorators: [] }));
  assertEq(loadConfig(dir).publicDecorators.length, 0);
  fs.writeFileSync(cfgFile, JSON.stringify({ publicDecorators: "Public" }));
  assertEq(JSON.stringify(loadConfig(dir).publicDecorators), JSON.stringify(def));
});
t.test(".apigate.config.example.json is valid JSON", () => {
  const root = path.resolve(__dirname, "..");
  const raw = fs.readFileSync(path.join(root, ".apigate.config.example.json"), "utf-8");
  JSON.parse(raw);
});

t.finish();
