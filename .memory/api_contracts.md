# API contracts

The server uses MCP over stdio. `MOBILE_DEVELOPER_MCP_CONFIG_PATH` points to a
bounded local JSON configuration; without it, the local app list is empty.
Apps use a safe local alias (`appId` in tools), an optional Google Play package
configuration, and/or an optional numeric App Store Connect ID configuration.

All tool failures are structured, sanitized `CONFIGURATION`, `AUTHORIZATION`,
`NOT_FOUND`, or `PROVIDER` errors. Paged tools accept `limit` 1–100 and cursor
tokens without following pages automatically. Tool metadata reports a source
and limits; provider-specific responses also preserve pagination where offered.

Google tools query Android Publisher releases/reviews, Play Reporting
`errorIssues:search`, and predefined private GCS installation objects. Vitals
uses UTC hour-aligned DateTime query components. Installation reports accept
gzip and UTF-8/UTF-16 CSV, retain daily observations and dimensions, and read
at most thirteen monthly objects.

Apple tools use nested App Store Connect endpoints for app versions, customer
reviews, and analytics requests; builds are filtered by app and diagnostics by
build. Sales reads the vendor's daily Sales/Summary report and returns product
type `1` rows only. It does not claim to filter vendor report rows by Apple app
ID. Analytics exposes existing metadata/segment IDs only, never signed URLs or
downloads.

Every provider business call uses GET. Authentication may exchange tokens, but
the server never creates, edits, publishes, replies, generates reports, or
writes storage objects. See [architecture](architecture.md) and
[coding standards](coding_standards.md).
