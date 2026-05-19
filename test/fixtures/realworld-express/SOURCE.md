# RealWorld backend fixture

Vendored from:
- Repository: https://github.com/gothinkster/node-express-realworld-example-app
- Commit SHA: `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b`
- License: MIT (per the upstream repository)

Note: despite the repository name, the canonical gothinkster Node RealWorld
backend is implemented in NestJS. This is the official reference
implementation linked from https://realworld-docs.netlify.app/. The fixture
exercises ApiGate's NestJS parser against a real-world surface (4 feature
controllers, JWT auth guards, OpenAPI-less codebase). The Express + Fastify
parsers are exercised by `test/fixtures/sample-app/` and
`test/fixtures/fastify-app/` respectively.

Only `src/` and `package.json` were copied. Test specs, lockfiles, build
artifacts, and Docker assets are intentionally omitted to keep the fixture
small and deterministic.

This directory is the input to `samples/realworld-express/` — the committed
sample report rendered through `@stelnyx/report-theme`.
