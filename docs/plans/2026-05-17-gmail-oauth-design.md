# Gmail OAuth Connector Design

This note scopes the next External Access step after the read-only Gmail
access-token slice. It intentionally avoids Tasks-page UI changes.

## Decision

Use the Google installed-app OAuth flow with a system browser and loopback
redirect for desktop builds. Store the refresh token in the OS keychain, keep
access tokens short-lived and in memory, and continue to route Gmail evidence
only through task-bound `ConnectorSourceIngestionPlan`.

This is the smallest viable production path:

- it matches Google's desktop-app guidance for system-browser authorization and
  loopback redirects;
- it avoids asking users to paste access tokens;
- it keeps sensitive credentials out of `config.json`;
- it preserves the current External Access boundary where status reads do not
  probe Gmail and evidence is fetched only for a specific task;
- it leaves Gmail send, label mutation, background sync, and full-body import
  out of scope.

## Source Constraints

Official Google guidance that shapes this design:

- Desktop installed apps should open the system browser and use a local redirect
  URI to receive the authorization response.
  Source: <https://developers.google.com/identity/protocols/oauth2/native-app>
- Loopback IP redirect is the recommended desktop mechanism on macOS, Linux,
  and Windows desktop when supported.
  Source: <https://developers.google.com/identity/protocols/oauth2/native-app>
- Refresh tokens require offline access and allow new access tokens without
  prompting the user again.
  Source: <https://developers.google.com/identity/protocols/oauth2/web-server>
- Gmail read and metadata scopes are restricted. Apps should request the
  narrowest scope possible, and public applications using restricted Gmail
  scopes may require verification and security review.
  Sources:
  <https://developers.google.com/workspace/gmail/api/auth/scopes>,
  <https://developers.google.com/workspace/workspace-api-user-data-developer-policy>

## Minimal Architecture

### Configuration

Non-sensitive values:

- OAuth client id.
- Optional account label.
- Default Gmail query.
- Default max result limit.

Sensitive values:

- Refresh token in keychain.
- Current access token in memory only.

The current env access-token path remains a local development fallback until
OAuth is implemented. It should not become the production credential model.

### Services

`GmailOAuthConfig`

- Reads non-sensitive OAuth settings from config or env.
- Validates that a desktop OAuth client id is present.
- Does not contain token values.

`GmailOAuthTokenStore`

- Stores, reads, and deletes the refresh token through keychain.
- Never writes refresh tokens to logs, task memory, source contexts, or
  `config.json`.

`GmailOAuthService`

- Creates the authorization URL with a generated state and PKCE verifier.
- Starts a local loopback listener only during explicit authorization.
- Exchanges the authorization code for tokens.
- Saves only the refresh token.
- Refreshes access tokens on demand for task-bound ingestion.
- Revokes and clears credentials on disconnect.

`GmailConnectorAdapter`

- Continues to expose `getStatus()` without network probing.
- Receives an access-token provider instead of only a static access token.
- Calls Gmail only inside `listEvidence()` for a task-bound ingestion request.

## Runtime Boundary

OAuth is a capability configuration flow, not a task mutation. Runtime gates:

- Connect Gmail: explicit user action, external OAuth, keychain write.
- Disconnect Gmail: explicit user action, token revoke best effort, keychain
  delete.
- Refresh token: internal credential maintenance, allowed only when a task-bound
  connector ingestion asks for Gmail evidence.
- List/read Gmail metadata: external read, task-bound, normalized through
  `ConnectorSourceIngestionPlan`.

No OAuth step may write task memory. Gmail evidence can become task source
material only after `ConnectorSourceIngestionPlan` marks it reviewable and a
confirmed `ExternalAccessSourceIngestionService` commit routes it through
`TaskService.createSourceContext`.

## Scope Choice

First implementation should request the narrowest scope that can support the
actual product behavior:

- preferred target: metadata-only reads if snippets are not required;
- current adapter behavior: message metadata plus snippet, which likely requires
  broader Gmail read access and should stay review-gated.

Before shipping public OAuth, confirm whether the product can avoid snippets and
full message content. If it can, the connector should use metadata-only reads
and summarize source value from headers, labels, dates, and user-selected
search queries. If snippets remain necessary, keep the warning that Gmail read
scopes are restricted and require product/privacy review.

## Implementation Slices

1. Token-store foundation
   - Add keychain-backed Gmail token store.
   - Add status projection for "configured by refresh token" without probing.
   - Add unit tests that secrets never appear in status output.

2. OAuth local flow
   - Add authorization URL creation with PKCE and state validation.
   - Add loopback callback exchange.
   - Add revoke/disconnect.
   - Add script-level or service-level tests with mocked token endpoints.

3. Adapter integration
   - Let `GmailConnectorAdapter` accept an access-token provider.
   - Refresh access token only during task-bound `planSourceIngestion`.
   - Keep `getStatus()` network-free.

4. External Access UI
   - Add a small Connect/Disconnect control only on the External Access page.
   - Show account/configured state and restricted-scope warning.
   - Do not add Tasks-page layout or interaction changes.

5. Acceptance
   - Keep existing no-network preflight as default.
   - Add mocked OAuth acceptance coverage.
   - Add live OAuth smoke only behind an explicit environment gate.

## Non-goals

- No Gmail sending.
- No label, archive, delete, or mailbox mutation.
- No automatic background mailbox sync.
- No full email-body import in the first OAuth implementation.
- No startup Gmail probes.
- No chat-context injection from Gmail without task-memory/source review.

## Open Risk

Gmail read and metadata scopes are restricted under Google's policies. A local
developer path can proceed with explicit credentials, but any public production
release must treat Google verification and restricted-scope review as a product
release requirement, not a coding detail.
