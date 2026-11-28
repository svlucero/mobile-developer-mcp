# mobile-developer-mcp

A local [MCP](https://modelcontextprotocol.io/) server for querying Google Play
and App Store Connect from a compatible assistant: releases, reviews, technical
issues, and installation or download reports. **V1 is read-only.**

This is an independent project, not affiliated with Google or Apple. It is
experimental: tests use fixtures, and live access and permissions must be
verified for each installation.

## How it works

```text
MCP client / assistant
        │ JSON-RPC over stdin/stdout
        ▼
mobile-developer-mcp (local process)
        ├── app configuration + local credentials
        ├── Google: Android Publisher / Play Reporting / GCS
        └── Apple: App Store Connect / Sales / existing Analytics resources
```

The client starts the process and calls tools with validated parameters.
Provider adapters query APIs over HTTPS and return data with source and limit
metadata. There is no web interface or HTTP server. stdout is reserved for MCP;
diagnostics go to stderr. Returned data is available to the client and its
assistant: review how they handle your apps' private information.

Business queries use `GET`. The server does not publish releases, change tracks,
reply to reviews, or create reports. Google authentication may exchange tokens
using other HTTP requests. Each provider can be configured independently.

## Quick start

You need Git, npm, and Node.js LTS 22 or later. CI covers Node 22, 24, and 26.
Node 18, 20, and 23 are outside the supported environment. Check supported
versions on [Node.js Releases](https://nodejs.org/en/about/previous-releases).

```sh
git clone https://github.com/svlucero/mobile-developer-mcp.git
cd mobile-developer-mcp
npm ci
npm run build
cp mobile-developer-mcp.config.example.json mobile-developer-mcp.config.json
```

Edit the copied JSON with your identifiers and configure credentials for the
provider you use. The local copy is ignored by Git.

```sh
export MOBILE_DEVELOPER_MCP_CONFIG_PATH="$PWD/mobile-developer-mcp.config.json"
# For Google with a local service account only:
export GOOGLE_APPLICATION_CREDENTIALS="/private/path/google-service-account.json"
node dist/index.js
```

The process waits for MCP messages; it does not display a menu. Connect it to a
client as described below. Use `Ctrl+C` to stop it.

**The server does not load `.env` automatically.** `.env.example` is a reference:
export variables or pass them through the client configuration. There is no
published npm package or `npx` installation.

## App configuration

```json
{
  "apps": [
    {
      "id": "my-mobile-app",
      "googlePlay": {
        "packageName": "com.example.app",
        "tracks": ["production", "beta"],
        "reportingBucket": "pubsite_prod_rev_0123456789"
      },
      "appStore": {
        "appId": "1234567890",
        "vendorNumber": "12345678"
      }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Unique local alias: lowercase letters, numbers, and hyphens. Tools receive this value as `appId`. |
| `googlePlay.packageName` | The actual Android application identifier. |
| `googlePlay.tracks` | Tracks allowed for queries; they must exist in your account. |
| `googlePlay.reportingBucket` | Optional private statistics bucket, used for installations. |
| `appStore.appId` | Numeric App Store Connect ID, distinct from the local alias. |
| `appStore.vendorNumber` | Optional vendor number required for Sales reports. |

Remove `googlePlay` or `appStore` if you use only one store. Up to 100 apps are
supported, each with at least one provider. **Pass the configuration path through
`MOBILE_DEVELOPER_MCP_CONFIG_PATH`**: without it, the app list is empty even if
the example configuration file exists. Relative paths resolve from the process
working directory; prefer absolute paths in desktop clients.

### Google Play

Prepare an identity authorized for your apps in Play Console and enable the
APIs you need. The MCP server does not create identities or assign permissions.
Use `GOOGLE_APPLICATION_CREDENTIALS` with a service account file outside the
repository, or Application Default Credentials (ADC) available to the process.

| Resource | API / scope | Required access |
| --- | --- | --- |
| Releases and reviews | Android Publisher / `androidpublisher` | App access; reviews require **Reply to reviews** in Play Console, even though this server only reads them. |
| Crashes and ANRs | Play Developer Reporting / `playdeveloperreporting` | Access to the app's Android vitals data. |
| Installations | Cloud Storage / `devstorage.read_only` | Object read access to the private Play reports bucket. |

`GOOGLE_OAUTH_ACCESS_TOKEN` is also supported: a short-lived local token with
the required scopes. It takes priority over ADC and **is not automatically
renewed**. Do not put it in the app configuration JSON or an issue.

The status tool checks environment variables only. It may report `false` when
ADC is configured through another mechanism. A `true` result does not confirm
that a file exists, a token is valid, or the identity has permission.

References: [Google Play API setup](https://developers.google.com/android-publisher/getting_started),
[Play Reporting](https://developers.google.com/play/developer/reporting),
[statistics reports](https://support.google.com/googleplay/android-developer/answer/6135870).

### App Store Connect

Create an API key with access to the required resources, keep the `.p8` file
outside the repository, and configure:

```sh
export APP_STORE_CONNECT_KEY_PATH="/private/path/AuthKey_EXAMPLE.p8"
export APP_STORE_CONNECT_KEY_ID="EXAMPLEKEY"
export APP_STORE_CONNECT_ISSUER_ID="00000000-0000-0000-0000-000000000000"
```

The server signs ES256 JWTs locally. Sales and Analytics may use different
roles: the `APP_STORE_CONNECT_SALES_*` and `APP_STORE_CONNECT_ANALYTICS_*`
prefixes support `KEY_PATH`, `KEY_ID`, and `ISSUER_ID`. Each missing value falls
back to the primary credential; configure all three when changing accounts.
Sales requires `vendorNumber`. Analytics only inspects existing resources:
report setup and generation must happen outside the MCP server.

Roles, availability, and privacy restrictions may differ by resource.
Reference: [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/).

## Connect an MCP client

This uses the common `mcpServers` format; the exact format and file location
depend on the client. Use absolute paths. If `node` is not on the client's PATH,
replace `command` with the absolute path to the executable.

```json
{
  "mcpServers": {
    "mobile-developer": {
      "command": "node",
      "args": ["/path/to/mobile-developer-mcp/dist/index.js"],
      "env": {
        "MOBILE_DEVELOPER_MCP_CONFIG_PATH": "/private/path/apps.json",
        "GOOGLE_APPLICATION_CREDENTIALS": "/private/path/google-service-account.json",
        "APP_STORE_CONNECT_KEY_PATH": "/private/path/AuthKey_EXAMPLE.p8",
        "APP_STORE_CONNECT_KEY_ID": "EXAMPLEKEY",
        "APP_STORE_CONNECT_ISSUER_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

Remove variables for providers you do not use and reload the client. Start with
`mobile_developer_list_apps` and `mobile_developer_provider_status`; neither
contacts the stores.

Example assistant requests:

- "List configured apps and credential status."
- "Show releases for `my-mobile-app` on the `production` track."
- "Fetch 20 recent Google Play reviews for `my-mobile-app`."
- "Query ANR issues for version 42 from November 1 to November 2 in UTC."

Example MCP tool call, not a terminal command:

```json
{
  "name": "mobile_developer_google_play_releases",
  "arguments": { "appId": "my-mobile-app", "track": "production" }
}
```

For Vitals, use UTC timestamps aligned to an hour, for example
`start: "2026-11-01T00:00:00Z"`, `end: "2026-11-02T00:00:00Z"`.
Installation statistics use `YYYY-MM-DD` dates for `start` and `end`.

## Tools

All `limit` values accept 1–100 (default: 50). Pass `nextCursor` as `cursor`
in the next call with the same filters. Pages are not traversed automatically.
The `buildId` and `instanceId` values come from Apple.

| Tool | Main inputs | Output and limits |
| --- | --- | --- |
| `mobile_developer_list_apps` | `provider?`, `limit?` | Non-secret local configuration. |
| `mobile_developer_provider_status` | None | Credential presence, without verifying access. |
| `mobile_developer_google_play_releases` | `appId`, `track` | Up to 20 non-obsolete releases; no complete history or rollout percentage. |
| `mobile_developer_google_play_reviews` | `appId`, pagination, `translationLanguage?` | Reviews created/modified within the last week; no developer replies. |
| `mobile_developer_google_play_vital_issues` | `appId`, `start`, `end`, `versionCodes?`, `types?`, pagination | Grouped issues; types: `CRASH`, `ANR`, `NON_FATAL`. |
| `mobile_developer_google_play_installation_metrics` | `appId`, `start`, `end`, `dimension?` | Daily GCS CSV observations; up to 13 monthly objects. |
| `mobile_developer_app_store_versions` | `appId`, pagination, `platform?` | Versions and release state. |
| `mobile_developer_app_store_builds` | `appId`, pagination, `version?` | Builds and processing state. |
| `mobile_developer_app_store_reviews` | `appId`, pagination, `territory?` | Customer reviews without replies. |
| `mobile_developer_app_store_diagnostic_signatures` | `buildId`, pagination | Available diagnostics for a build; not all crashes. |
| `mobile_developer_app_store_sales_downloads` | `appId`, `date` | App rows from the vendor's daily report; up to 5 MiB. |
| `mobile_developer_app_store_analytics_existing` | `appId`, pagination, `instanceId?` | Existing requests, reports, instances, or segment IDs. |

## V1 limitations and status

- Tests verify the protocol and simulated responses. Contracts and permissions
  may need adjustments when validated against live accounts.
- Apple Sales selects a vendor using the local alias, but **does not filter
  rows by `appStore.appId`**. Inspect dimensions to identify the app; do not sum
  the entire report as a single app's total. The parser only includes
  `Product Type Identifier` equal to `1` and distinguishes redownloads only
  with `Order Type`; it does not cover all product types.
- Analytics lists metadata and IDs; it does not download or analyze segments.
  It does not create or resume requests, or expose signed download URLs.
- Google installation metrics preserve columns, dimensions, and daily
  observations without summing stocks. They are not equivalent to unique people
  or Apple's Sales metrics.
- The 5 MiB report limit applies to downloaded files; it does not guarantee
  a memory limit during decompression.
- Missing reports are not zero: they may yield `reportAvailable: false` or
  empty collections. Availability, retention, and privacy affect the data.
  Android vitals and Apple diagnostics have different coverage.
- GCS reads only use known monthly object names; the bucket is not listed.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Empty app list | `MOBILE_DEVELOPER_MCP_CONFIG_PATH` and the JSON file path. |
| `CONFIGURATION` | Unreadable files, invalid schema, missing Apple key, or invalid timestamps. |
| `AUTHORIZATION` | Expired token, scopes, roles, or bucket permissions. |
| `NOT_FOUND` | Unconfigured alias/track, incorrect ID, or missing resource. |
| `PROVIDER` | Network, quota, unexpected response, or report size limit. |
| Client cannot connect | Run `npm run build`; check `node`/`dist/index.js` paths and client stderr logs. |
| Terminal waits without output | Expected: the server waits for an MCP client over stdin. |

Do not paste tokens, keys, private reports, or unreviewed logs into issues or
pull requests. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Development and contributions

```sh
npm ci
npm run build
npm test
```

`npm test` compiles and runs Vitest: configuration, errors, JWTs, fixtures for
both providers, and stdio integration. No live credentials are required.
CI runs the suite on Linux with Node 22, 24, and 26.

```text
src/index.ts       Stdio entry point
src/server.ts      MCP tool registration
src/config.ts      Validated configuration
src/contracts.ts   Shared schemas
src/errors.ts      Sanitized errors
src/providers/     Google and Apple adapters
test/              Unit and integration tests
.memory/           Technical project context
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) to propose changes. All code, comments,
documentation, and synthetic examples must be written in English. Repository
agent instructions are in [AGENTS.md](AGENTS.md). V2 will evaluate additional
resources; V1 remains read-only. Report bugs and proposals through
[GitHub Issues](https://github.com/svlucero/mobile-developer-mcp/issues).

## License

[MIT](LICENSE), copyright 2026 svlucero. Store credentials, accounts, and data
are not covered by this license; they remain subject to their providers'
permissions and terms.
