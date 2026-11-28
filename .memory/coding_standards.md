# Coding standards

- Always write code, identifiers, comments, docstrings, documentation, README
  files, examples, agent instructions, commits, and pull request text in English.
  Preserve external identifiers and actual provider data. See ../AGENTS.md.
- Use strict TypeScript and ESM with `.js` extensions for local imports.
- Supported Node versions: 22 or versions from 24, preferably LTS. Tests use
  Vitest 4.1.12 or later in the 4.x line. Generate synthetic signing keys at
  runtime instead of storing PEM material in tests.
- Reserve stdout for MCP; send diagnostics to stderr.
- Validate external inputs at boundaries and bound pagination/download volume.
- Do not commit, log, or return secrets. Sanitize domain errors before returning
  them through MCP; distinguish configuration, authorization, missing resources,
  and provider failures with `McpDomainError`.
- Keep providers separate and V1 business resources read-only. Explicitly allow
  HTTP methods/routes; map 401/403 to `AUTHORIZATION`, 404 to `NOT_FOUND`, and
  rate limits or other failures to `PROVIDER`.
- Vitals uses UTC timestamps aligned to hours. Preserve metric units, periods,
  dimensions, and flow/stock semantics without manufacturing zeros.
- Inject environment, authentication, and transport dependencies for fixtures.
  Do not call live accounts in tests or CI.
- Configuration comes from `MOBILE_DEVELOPER_MCP_CONFIG_PATH`. No automatic
  `.env` loading occurs; export variables or pass a client environment.
- Store credentials outside Git. Version synthetic examples only. Treat Google
  OAuth tokens as secrets and sign short-lived Apple JWTs from local keys.
- Never return signed Analytics segment URLs. Missing data is not zero, and
  Apple diagnostic signatures are not a complete crash inventory.

`npm test` compiles and runs Vitest; `npm run build` type-checks and creates
`dist/`. Run the integrated suite before merging dependent changes. Use focused,
conventional commits. CI uses SHA-pinned actions and a read-only GitHub token.

Contributions use MIT; follow CONTRIBUTING.md and SECURITY.md. Keep package and
lockfile license metadata consistent. `private: true` controls npm publishing,
not repository visibility. Update all three memory documents with verified
knowledge when working on the repository.

See [architecture](architecture.md) and [API contracts](api_contracts.md).
