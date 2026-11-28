# Architecture

The project is a local Go 1.26+ MCP server. `cmd/mobile-developer-mcp` connects
the SDK server to stdio; stdout carries protocol messages only. `internal/mobile`
owns configuration, tool registration, HTTP boundaries, Google and Apple
adapters, report parsing, and fixture-based tests.

The server registers twelve independent, read-only tools. It validates tool
arguments and local JSON configuration before making provider calls. Provider
business requests are GET-only, errors are mapped to sanitized
`CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND`, or `PROVIDER` payloads, and all
provider access is optional per configured app.

Google authentication supports a supplied short-lived token, a service-account
file, or ADC. App Store Connect signs short-lived ES256 JWTs from local P-256
keys. Reports and decompressed report contents are limited to 5 MiB; Google
installation reads use known monthly object paths, never bucket listing.

Tests use the official Go MCP SDK's in-memory transport and mocked HTTP. They
do not use live credentials or accounts. See [coding standards](coding_standards.md)
and [API contracts](api_contracts.md).
