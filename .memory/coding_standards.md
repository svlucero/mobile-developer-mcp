# Coding standards

- Write source, identifiers, comments, tests, documentation, configuration
  examples, commits, and pull-request text in English.
- Use Go formatting (`gofmt`) and keep Go 1.26+ compatibility. Run `go test
  ./...`, `go test -race ./...`, `go vet ./...`, and a production build before
  merging a code change.
- Keep stdout exclusive to MCP. Send only generic, non-secret diagnostics to
  stderr. Do not log or return tokens, private keys, JWTs, signed URLs, or raw
  provider response bodies.
- Validate external input at the MCP boundary and reject unknown fields. Use
  bounded HTTP/report reads and preserve pagination, units, periods, and
  dimensions rather than manufacturing zero values.
- Keep provider integrations isolated and all V1 business-resource calls
  read-only. Map 401/403 to `AUTHORIZATION`, 404 to `NOT_FOUND`, and all other
  provider failures to `PROVIDER`.
- Inject environment, clock, token, and HTTP dependencies where tests need
  deterministic fixtures. Never call a live store account in tests or CI.

See [architecture](architecture.md) and [API contracts](api_contracts.md).
