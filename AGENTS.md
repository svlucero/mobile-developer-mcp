# Repository instructions

## Language

Always write code, identifiers, comments, docstrings, README files, documentation,
configuration examples, agent instructions, commit messages, and pull request
titles and descriptions in English, regardless of the conversation language.
Keep synthetic examples and fixtures in English. Preserve external API identifiers,
proper names, and actual provider or user data without translating them.

## Project context

- Read `CLAUDE.md` and the three `.memory/` documents before implementation.
- Keep all V1 business operations read-only. Provider authentication may exchange
  tokens, but must not mutate store business resources.
- Reserve stdout for the MCP protocol; write diagnostics to stderr.
- Never commit or expose credentials, tokens, private reports, or signed URLs.
- Run `go test ./...` for code changes. Update documentation and project memory to
  reflect verified behavior; distinguish fixtures from live-account validation.
