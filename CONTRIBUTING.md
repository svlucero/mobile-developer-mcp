# Contributing

Write source code, identifiers, comments, docstrings, documentation, examples,
commit messages, and pull request titles and descriptions in English. Keep
synthetic fixtures in English; preserve actual provider data and API identifiers.
See [AGENTS.md](AGENTS.md) for repository instructions.

For large changes, describe the problem in an issue first. Documentation fixes
and small bug fixes can be submitted directly as pull requests.

## Set up your environment

1. Fork and clone the repository, or create a branch if you have write access.
2. Use Node LTS; the CI matrix covers 22, 24, and 26.
3. Run `npm ci` and `npm test`. No live credentials are required.
4. Keep changes focused and add tests for behavior changes.

## Conventions

- Use strict TypeScript, ESM, and `.js` extensions for local imports.
- Separate provider adapters and validate MCP inputs.
- Keep V1 read-only: no publishing, review replies, resource editing, or report
  generation.
- Reserve stdout for the protocol; write diagnostics to stderr.
- Convert failures to sanitized errors. Do not include keys, tokens, actual
  reports, customer names, or personal data in code or fixtures.
- Use synthetic fixtures, not live accounts, in tests and CI.
- Keep README and all three `.memory/` documents aligned with the implementation.
- Use descriptive commits, such as `fix: handle missing review text`.

Authentication token exchanges do not authorize business resource mutations.
For new queries, document permissions, source, period, limits, and semantics.

## Before opening a pull request

```sh
npm run build
npm test
git diff --check
git status --short
```

Describe the problem, resulting behavior, validation, and limitations. Distinguish
fixtures from live validation without publishing account data. CI must pass
before merging. Accepted contributions are distributed under the
[MIT license](LICENSE).

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening public
issues. Treat others respectfully and keep discussions focused on technical
changes.
