# Contributing to ApiGate

Thanks for your interest. ApiGate is a static API surface auditor — contributions that improve parser accuracy, reduce false positives, or extend framework coverage are especially welcome.

## Ground rules

- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Report security issues privately — see [SECURITY.md](SECURITY.md). Never open a public issue for a vulnerability.
- Open an issue before large changes so we can align on scope.
- ApiGate consumes [`@stelnyx/report-theme`](https://github.com/Stelnyx/report-theme) as the single source of truth for HTML report rendering. Do not fork or restyle locally — see [DESIGN_PARITY.md](DESIGN_PARITY.md).

## Development setup

```bash
git clone https://github.com/Stelnyx/ApiGate.git
cd ApiGate
npm install
node apigate.js --help

# Run the full test suite
npm test

# Lint
npm run lint
```

## Pull request checklist

- [ ] Branch name describes the change (`feat/<slug>`, `fix/<slug>`, `docs/<slug>`)
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`)
- [ ] New parsers / detectors include a test fixture and assertions
- [ ] If golden numbers in `test/golden-apigate.mjs` move, the PR description explains why
- [ ] `npm test` passes; `npm run lint` passes
- [ ] If the report HTML changed, `test/report-theme-contract.mjs` still passes and no `<!doctype>` literal was introduced outside `lib/report.mjs`
- [ ] README updated if CLI flags, config fields, or output shape changed

## Commit message format

```
<type>(<scope>): <short description>

<optional body explaining why, not what>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `security`, `perf`.

## Adding a new framework parser

1. Add `lib/parsers/<name>.mjs` exporting `parse<Name>(targetDir, excludePaths) → { endpoints, warnings, specsDetected? }`.
2. Wire it into `lib/inventory.mjs` behind a `frameworks.<name>` toggle.
3. Add a fixture under `test/fixtures/<name>-app/` and a `test/parser-<name>.mjs` suite.
4. Add a row to the Frameworks table in `README.md`.
5. Add the framework's idiomatic auth identifiers to `CONFIG_DEFAULTS.auth.<name>` in `lib/config.mjs`.

## Questions

Open a [discussion](https://github.com/Stelnyx/ApiGate/discussions) or a regular issue. Security matters go through private advisory only.
