# mobile-developer-mcp — project context

## Purpose

Local, read-only MCP server for querying mobile-store business data. The initial
server establishes the secure protocol boundary; provider-specific queries are
added by later issues.

## Architecture

- `src/`: TypeScript source, with shared contracts, configuration, provider
  adapters, error handling, and the stdio MCP entry point.
- `test/`: unit and stdio integration tests.
- `.memory/`: durable architecture, convention, and API-contract context.

## Commands

- `npm install` installs dependencies.
- `npm run build` type-checks and compiles to `dist/`.
- `npm test` runs the test suite.
- `npm start` starts the server over stdio; diagnostic output is written only to
  stderr.

## Conventions and constraints

- TypeScript uses strict mode and ESM imports.
- Keep MCP tools read-only. Provider adapters may acquire tokens but must never
  mutate store business resources.
- Validate untrusted input at the MCP boundary. Return structured, sanitized
  errors; never put secrets in protocol output or logs.
- Provider integrations remain separate and optional: configuring one does not
  require the other.
