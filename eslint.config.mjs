import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "test/fixtures/", "samples/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    // Forbid any inline <!doctype html string outside lib/report.mjs.
    // The only sanctioned HTML doc generator is @stelnyx/report-theme via lib/report.mjs.
    files: ["**/*.mjs", "**/*.js"],
    ignores: ["lib/report.mjs", "test/report-theme-contract.mjs", "eslint.config.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/<!doctype/i]",
          message: "Inline HTML documents are forbidden — ApiGate must consume @stelnyx/report-theme via lib/report.mjs."
        },
        {
          selector: "TemplateElement[value.raw=/<!doctype/i]",
          message: "Inline HTML documents are forbidden — ApiGate must consume @stelnyx/report-theme via lib/report.mjs."
        }
      ]
    }
  },
  {
    files: ["test/**/*.mjs"],
    rules: {
      "no-empty": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_?" }]
    }
  }
];
