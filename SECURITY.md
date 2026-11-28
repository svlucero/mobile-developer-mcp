# Security

## Report a vulnerability

Use [Report a vulnerability on GitHub](https://github.com/svlucero/mobile-developer-mcp/security/advisories/new)
if enabled. Otherwise, contact the maintainer through a private channel listed
on their [profile](https://github.com/svlucero). You may open an issue requesting
a private channel without including exploit details, credentials, or account
data. There is no guaranteed response time.

Include the affected version or commit, impact, and reproduction steps using
synthetic data. Do not send keys or actual reports. If a credential is exposed,
revoke or rotate it: deleting it from a file or the latest commit does not
invalidate it or remove historical copies.

## Status and scope

The project is experimental. Only the current state of `main` is maintained;
there is no backport policy. Fixture-based tests are not a security audit and
do not validate live permissions.

MCP uses local stdio; queries and authentication require outbound connections
to Google and Apple. Queried private data reaches the MCP client. Use trusted
clients and assistants and evaluate how they handle that data.

Keep credentials outside the repository and grant the minimum permissions per
resource. Although the server only queries business data, some scopes or
credentials may permit other provider operations. Download limits do not
guarantee memory limits during report decompression. Do not use keys or files
from untrusted sources.

Examples contain placeholders. `.gitignore` reduces accidental inclusion, but
does not prevent publishing previously tracked files or detect every secret.
Review the diff and history before publishing.

Tests generate ephemeral keys. Earlier revisions contain a public fixture key
with synthetic IDs; it must never be reused as a credential.
