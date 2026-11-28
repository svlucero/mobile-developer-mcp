# mobile-developer-mcp

A local, read-only [Model Context Protocol](https://modelcontextprotocol.io/)
server for Google Play and App Store Connect. It exposes releases, reviews,
Android vitals, installation reports, App Store diagnostics, Sales downloads,
and existing Analytics metadata through stdio.

This independent project is not affiliated with Google or Apple. V1 uses
fixtures in tests; validate permissions and availability against your own live
accounts before relying on a result.

## Safety model

The executable communicates with an MCP client over JSON-RPC on stdin/stdout.
It has no HTTP server or web UI. stdout is reserved for MCP; diagnostics go to
stderr. All business-resource requests are `GET`; the server never publishes a
release, edits a track, replies to a review, creates a report, or writes/list
objects. Authentication can obtain or sign short-lived tokens locally.

Do not share tokens, private keys, local report files, or unreviewed MCP output.

## Install and run

Go 1.26 or newer is required.

```sh
git clone https://github.com/svlucero/mobile-developer-mcp.git
cd mobile-developer-mcp
go build -o mobile-developer-mcp ./cmd/mobile-developer-mcp
cp mobile-developer-mcp.config.example.json mobile-developer-mcp.config.json
export MOBILE_DEVELOPER_MCP_CONFIG_PATH="$PWD/mobile-developer-mcp.config.json"
./mobile-developer-mcp
```

The process waits for an MCP client; a terminal with no visible output is
expected. The server never loads `.env` automatically. Export environment
variables yourself or pass them in the MCP client configuration.

Example client configuration (use absolute paths):

```json
{
  "mcpServers": {
    "mobile-developer": {
      "command": "/path/to/mobile-developer-mcp/mobile-developer-mcp",
      "env": {
        "MOBILE_DEVELOPER_MCP_CONFIG_PATH": "/private/path/apps.json",
        "GOOGLE_APPLICATION_CREDENTIALS": "/private/path/google-service-account.json"
      }
    }
  }
}
```

## Application configuration

```json
{
  "apps": [{
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
  }]
}
```

`id` is a local lowercase alias used as `appId` in tool calls. It is not the
store identifier. `reportingBucket` is needed only for Google installation
metrics. `vendorNumber` is needed only for App Store Sales reports. A maximum
of 100 configured apps is supported.

## Credentials

Google uses `GOOGLE_OAUTH_ACCESS_TOKEN` (a short-lived token, not refreshed),
`GOOGLE_APPLICATION_CREDENTIALS`, or Application Default Credentials. The
required scopes are selected per resource: Android Publisher, Play Developer
Reporting, or read-only Cloud Storage. Google Play review access requires the
Play Console "Reply to reviews" permission even for this read-only server.

App Store Connect requires these primary variables:

```sh
export APP_STORE_CONNECT_KEY_PATH="/private/path/AuthKey_ABC123.p8"
export APP_STORE_CONNECT_KEY_ID="ABC123"
export APP_STORE_CONNECT_ISSUER_ID="00000000-0000-0000-0000-000000000000"
```

Sales and Analytics may use `APP_STORE_CONNECT_SALES_*` and
`APP_STORE_CONNECT_ANALYTICS_*` respectively. Each missing field falls back to
the primary credential. The server signs P-256 ES256 JWTs locally and never
returns them.

## Tools

All paged `limit` values are 1–100 (default 50). Pass a returned `nextCursor`
as `cursor` with unchanged filters. The server never follows pages for you.

| Tool | Required inputs | Result |
| --- | --- | --- |
| `mobile_developer_list_apps` | — | Safe local aliases and providers. |
| `mobile_developer_provider_status` | — | Credential-presence checks only. |
| `mobile_developer_google_play_releases` | `appId`, `track` | Active releases for a configured track. |
| `mobile_developer_google_play_reviews` | `appId` | User reviews, not developer replies. |
| `mobile_developer_google_play_vital_issues` | `appId`, `start`, `end` | Crashes, ANRs, and non-fatal issue groups. |
| `mobile_developer_google_play_installation_metrics` | `appId`, `start`, `end` | Daily GCS installation report observations. |
| `mobile_developer_app_store_versions` | `appId` | App Store versions and release state. |
| `mobile_developer_app_store_builds` | `appId` | Builds and processing state. |
| `mobile_developer_app_store_reviews` | `appId` | Customer reviews, without replies. |
| `mobile_developer_app_store_diagnostic_signatures` | `buildId` | Available diagnostic signatures. |
| `mobile_developer_app_store_sales_downloads` | `appId`, `date` | Vendor daily Sales/Summary download rows. |
| `mobile_developer_app_store_analytics_existing` | `appId` | Existing Analytics metadata or segment IDs. |

Vitals `start` and `end` must be UTC hour-aligned RFC 3339 timestamps, for
example `2026-11-01T00:00:00Z`. Installation dates and Sales `date` use
`YYYY-MM-DD`.

## Important limits

- Provider responses and decompressed reports are capped at 5 MiB; installation
  requests read at most 13 known monthly objects and never list a bucket.
- App Store Sales reports are selected by vendor number, not filtered by Apple
  app ID. Inspect returned dimensions before aggregating. Only product type `1`
  is included; `Order Type` is used when available to distinguish redownloads.
- Analytics only lists existing metadata and IDs. It neither generates reports
  nor downloads segments or exposes signed URLs.
- Missing data is not zero. Store retention, privacy rules, permissions, and
  report latency affect what is available.

## Development

```sh
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/mobile-developer-mcp
```

Tests use synthetic provider responses and do not contact live accounts. See
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the project
memory in [`.memory/`](.memory/).
