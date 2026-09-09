# Agent access on personal Brains

Personal Brain provisioning and image restore install a Kody connection for remote
coding sessions. This does not change the desktop SSH configuration or the Codex
account on the VPS. The managed MCP entry is named `kody-vps`.

The connection is a revocable machine credential, scoped to the personal Brain
owner and registered app. It contains no copy of personal or repository secret
values. Its encrypted identity is stored through the existing personal Brain
state service. Destroying the managed Brain revokes the connection. Concurrent
provisioning reuses the connection; rebuilding the same app preserves it.

Kody tools reuse the existing MCP catalog and action services. The client detects
the GitHub repository from the session's working directory. Each request checks
repository write access using the owner's saved personal `GITHUB_TOKEN`; caller
headers cannot replace that identity. Start a session in a GitHub checkout to use
the repository tools. A missing saved GitHub token produces an explicit access
error; a desktop token is not silently substituted.

Commands can request named personal credentials:

```sh
kody exec --secret FLY_API_TOKEN -- flyctl status
```

To request repository secrets instead:

```sh
kody exec --repo owner/repository --secret DEPLOY_TOKEN -- command arguments
```

The client fetches current values over HTTPS, refuses redirects, and supplies them
only to the child command's environment. It does not print or write the values.
The command itself can access and disclose them; use trusted commands. Personal
and repository stores never silently fall back to each other. Internal Kody
credentials and server master/service keys are excluded. Existing Kody Chat tools
continue to hide secret values.

Setup uses the existing image SSH startup hook. Images must support that hook and
contain Node, Codex and OpenSSH. Existing machines receive managed files on the next
provision/update; an old image without the hook needs an updated image. This source
change does not update a running VPS or deploy the dashboard automatically.

Verification must cover machine identity and revocation, repository permission
checks, credential isolation, child process execution, preservation of Codex auth
and unrelated configuration, and a real provision-to-SSH session against the deployed
candidate before claiming production readiness.

## Validation — 2026-09-09

The follow-up corrected two browser failures. Shared browser mocks now match
request paths even when query parameters are present. Views waits for its route
selection instead of briefly navigating to the first bookmark during restoration;
the regression asserts that history has no extra navigation entries. The machine
search journey also waits for initial desktop selection before exercising search.

- Regression tests: passed for connection reuse/revocation, owner identity,
  repository permission checks, credential filtering, provisioning/update
  idempotency, real child commands and MCP message/session forwarding.
- Typecheck/lint: root `pnpm verify` passed (existing lint warnings remain).
- Production build: passed as part of root verification.
- Targeted browser tests: Facebook Connections, Views navigation and all four
  SSH download/search tests passed in the mounted local production build.
- Full mocked browser gate: passed, 147/147 tests in the final run.
- Live local: a real child command retrieved a temporary credential through the
  mounted API and real Convex storage. Internal service credentials were denied;
  revocation stopped the command. The mounted Kody MCP route verified the saved
  dedicated-test GitHub identity and returned the authorized repository scope.
  Test credentials were removed and the temporary access/app records cleared.
- Full Fly provision-to-SSH journey: not run against a deployed candidate.
- Deployed live: passed on the candidate and promoted production site for command
  credential delivery, internal credential exclusion, authorized Kody tool scope
  and revocation. Temporary test records and credentials were cleared.
- Existing public MCP: deployed Codex and Claude handshakes and repository scope
  action passed.
- Image export: added and passed regression coverage excluding `/etc/kody-agent`
  so saved images do not contain the machine access token.
- The real installed Codex CLI preserved authentication, model selection and
  another MCP server when adding `kody-vps` in an isolated temporary config.

Commits `15bd174b6` and `2ec7bf47e` were pushed to main. Exact commit
`2ec7bf47ea10f660a6bf1106909b12783bf261b7` was built in a clean detached checkout,
verified at `https://kody-dashboard-9oszm9y31-aguy.vercel.app`, and promoted to
`https://kody-dashboard-khaki.vercel.app`. Final dashboard typecheck passed.

The existing personal VPS was not updated. Its owner/app record exists in the
development backend but is absent from production. The Kody website used to manage
that VPS must be confirmed before choosing its credential backend; no credentials
or ownership records were migrated. The narrow startup image was built privately
from its current image with OpenSSH and the existing managed startup hook:
`registry.fly.io/kody-brain-user-416e31f3e4da1ccf:agent-access-2ec7bf47e`.
It has not been applied or restart-tested. Desktop SSH configuration and the VPS
Codex login remain unchanged.
