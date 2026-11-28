# Architecture

## Purpose

A local, read-only MCP server for Google Play and App Store Connect releases,
reviews, diagnostics, and installation/download reports. Providers are optional
and independent.

## Implementation

- Node.js/TypeScript and ESM. `src/index.ts` connects the MCP server to stdio;
  stdout is reserved for JSON-RPC and diagnostics go to stderr.
- `src/server.ts` registers local inspection and provider query tools.
- `src/config.ts`, `src/contracts.ts`, and `src/errors.ts` provide validated
  configuration, shared schemas, and sanitized domain errors.
- `src/providers/google-play.ts` uses ADC, a local service account, or a
  short-lived environment token. Business calls use GET to Android Publisher,
  Play Developer Reporting, and known private GCS report objects.
- Google installation CSV parsing supports gzip, UTF-8, and UTF-16. Downloads
  are limited to 5 MiB each and up to 13 monthly objects. Daily stock observations
  are not summed as installation flows.
- `src/providers/app-store.ts` signs ES256 JWTs from local keys. It reads
  versions, builds, reviews, diagnostics, Sales, and existing Analytics metadata.
  Sales/Analytics can have separate credentials; signed segment URLs are omitted.
- Configuration and credentials are injected into adapters. Configuring one
  provider does not require the other.

## Distribution and validation

Install from Git using `npm ci`; `private: true` prevents accidental npm
publication. LICENSE uses MIT. README explains setup, CONTRIBUTING covers
contributions, and SECURITY describes private vulnerability reports.
AGENTS.md and CLAUDE.md require English for project artifacts.

Tests cover configuration, errors, JWTs, provider fixtures, and actual MCP calls
over stdio with simulated responses. GitHub CI tests Node 22/24/26 and audits
dependencies without store credentials. Tests generate ephemeral signing keys.

## Boundaries

- V1 does not publish, edit tracks, reply to reviews, create reports, or write
  or list GCS objects. Authentication may exchange tokens.
- Google releases use the direct track endpoint without edits; reviews return
  user comments without developer replies.
- Apple Analytics inspects existing resources; it does not download segments
  or create/resume report requests.
- Sales selects a configured vendor number, without filtering by Apple app ID.
  Rows retain dimensions for identifying individual apps.
- Report download limits do not guarantee decompression memory limits.

See [coding standards](coding_standards.md) and [API contracts](api_contracts.md).
