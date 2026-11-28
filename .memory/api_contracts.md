# API contracts

## Configuration and local tools

The server uses MCP over stdio. `MOBILE_DEVELOPER_MCP_CONFIG_PATH` selects the
app configuration; if absent, configuration is empty. No file discovery or
automatic `.env` loading occurs. The local app `id` is the tool's `appId`,
distinct from the numeric Apple ID stored in `appStore.appId`.

`mobile_developer_list_apps` accepts optional `provider` (`google-play` or
`app-store`) and `limit` (1–100), returning non-secret configuration and limit
metadata. `mobile_developer_provider_status` returns credential-presence booleans;
it does not validate roles or every ADC discovery mechanism.

Domain errors use sanitized `CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND`, or
`PROVIDER` codes. Missing data must not become zero. Preserve source, unit,
period, dimensions, limits, and pagination where applicable.

## Google Play

Authentication uses ADC, `GOOGLE_APPLICATION_CREDENTIALS`, or a short-lived
`GOOGLE_OAUTH_ACCESS_TOKEN`. Scopes are selected per resource: `androidpublisher`,
`playdeveloperreporting`, and `devstorage.read_only`. Play Console requires
"Reply to reviews" permission for review queries, although tools never reply.

- `mobile_developer_google_play_releases`: local `appId` and configured `track`;
  GET `/applications/{packageName}/tracks/{track}/releases`. Maps ReleaseSummary
  fields `releaseName`, `activeArtifacts[].versionCode`, and
  `releaseLifecycleState` to `name`, `versionCodes`, and `status`. No edits are
  created. Google returns up to 20 non-obsolete releases without complete
  history or rollout percentages.
- `mobile_developer_google_play_reviews`: `appId`, limit 1–100, optional cursor
  and `translationLanguage`. GET `/reviews`, returning user comments, rating,
  timestamps, and versions where available, without developer replies. Google
  exposes reviews created or modified within the last week. Empty pages are
  valid; authorization errors are not empty results.
- `mobile_developer_google_play_vital_issues`: `appId`, hour-aligned UTC
  `start`/`end`, optional `versionCodes`, types (`CRASH`, `ANR`, `NON_FATAL`),
  limit 1–100, and cursor. GET `v1beta1/apps/{package}/errorIssues:search`.
  Preserves returned counts and exposes the next cursor without following it.
- `mobile_developer_google_play_installation_metrics`: `appId`, date range,
  optional dimension. Reads known monthly objects from the configured
  `reportingBucket`: `stats/installs/installs_{package}_{yyyyMM}.csv`, with an
  optional `_{dimension}` suffix before `.csv`. No object listing or writes.
  Daily observations preserve exact column names, count units, dimensions,
  entity (`events`, `devices`, `users`), and temporal type (`flow`, `stock`).
  Accepts gzip and UTF-8/UTF-16 CSV with BOM, up to 5 MiB per downloaded object
  and 13 monthly objects. Missing objects are omitted without manufacturing zeros.

## App Store Connect

Primary credentials use `APP_STORE_CONNECT_KEY_PATH`, `_KEY_ID`, and
`_ISSUER_ID`. `APP_STORE_CONNECT_SALES_*` and `APP_STORE_CONNECT_ANALYTICS_*`
allow separate roles with per-field fallback to primary credentials. The
adapter signs short-lived ES256 JWTs locally and uses GET for business queries.

- `mobile_developer_app_store_versions`, `_builds`, and `_reviews`: local
  `appId`, limit 1–100, optional cursor and resource-specific filter. Reviews
  exclude developer replies. Cursors are not followed automatically.
- `mobile_developer_app_store_diagnostic_signatures`: `buildId` and pagination;
  available build diagnostics, not all production crashes.
- `mobile_developer_app_store_sales_downloads`: local `appId` selects configured
  `vendorNumber`; `date` selects a daily Sales/Summary report. Preserves source,
  period, and dimensions. The parser includes only product type `1`, excludes
  IAP, and distinguishes initial downloads/redownloads only when `Order Type`
  exists; otherwise it returns `downloads`. It does not cover every product
  type or filter report rows by the Apple app ID. Use dimensions to identify
  individual apps.
- `mobile_developer_app_store_analytics_existing`: existing requests, reports,
  instances, and segment IDs. Never creates/resumes generation or returns
  signed URLs. Inspects metadata only, without downloading segments. Missing
  resources may require manual setup, permissions, or waiting for availability.

Sales and Analytics depend on roles, report latency, and privacy restrictions.
Reports larger than 5 MiB are rejected, but download limits do not bound
decompression memory. HTTP 401/403 maps to `AUTHORIZATION`, 404 to `NOT_FOUND`,
and other failures/rate limits to `PROVIDER`.

## Verified V1 guarantees

Provider business calls use GET without POST/PUT/PATCH/DELETE routes. Stdio
integration tests exercise Google and Apple fixtures and reject other HTTP
methods for those calls. They verify protocol handling, normalization, and
secret redaction, not live account roles, bucket access, or report availability.

All authored code, comments, documentation, and synthetic examples use English;
external provider payloads retain their original data and language.

See [architecture](architecture.md) and [coding standards](coding_standards.md).
