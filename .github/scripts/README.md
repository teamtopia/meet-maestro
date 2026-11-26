# Release notes → Zendesk sync

`sync-zendesk.mjs` runs from `.github/workflows/sync-zendesk-version-history.yml` whenever a release is
published. It adds the release notes to the Swimtopia Meet Version History help article.

## Authentication

Zendesk is retiring API tokens, so the sync authenticates as an OAuth client. Each run exchanges the client
credentials for a short-lived access token (`client_credentials` grant, scope `hc:read hc:write`) and sends it
as a Bearer token. Tokens last 30 minutes and a run takes seconds, so nothing is cached.

Repository secrets:

| Secret                  | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `ZENDESK_SUBDOMAIN`     | The Zendesk subdomain                              |
| `ZENDESK_CLIENT_ID`     | `devbot-cli` (shared with Devbot)                  |
| `ZENDESK_CLIENT_SECRET` | That client's secret, stored with Devbot's credentials |

The client is shared with Devbot: rotating its secret means updating it here too.

## Running locally

```bash
npm ci
npm test

# Read-only check against Zendesk: requests a token, reads the article, prints the new body, writes nothing
DRY_RUN=true ZENDESK_SUBDOMAIN=… ZENDESK_CLIENT_ID=… ZENDESK_CLIENT_SECRET=… \
  RELEASE_TAG=v0.0.0 RELEASE_BODY='- test' RELEASE_PUBLISHED_AT=2026-01-01T00:00:00Z \
  node sync-zendesk.mjs
```

A failed run can be retried with `gh run rerun <run-id>`; it replays the original release. Re-run several failed
releases oldest first.
