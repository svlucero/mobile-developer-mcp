# mobile-developer-mcp — project context

## Purpose

Local, read-only MCP server for Google Play and App Store Connect operational
data. It uses stdio and has no public network listener.

## Architecture

- `cmd/mobile-developer-mcp/` contains the executable entry point.
- `internal/mobile/` contains configuration validation, MCP registration,
  provider adapters, report parsers, authentication, and tests.
- `.memory/` stores durable project knowledge.

## Commands

- `go test ./...` runs tests.
- `go test -race ./...` checks concurrent execution.
- `go vet ./...` performs static checks.
- `go build ./cmd/mobile-developer-mcp` builds the stdio executable.

## Constraints

- Keep all project artifacts in English.
- Keep V1 business operations read-only and reserve stdout for MCP JSON-RPC.
- Validate MCP input, bound pagination/report sizes, and sanitize errors.
- Never commit, log, or return credentials, JWTs, signed URLs, or private reports.
