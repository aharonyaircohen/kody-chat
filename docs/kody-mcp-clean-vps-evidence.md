# Clean VPS continuity evidence

Date: 2026-09-12. Repository coding continuity has live evidence; the full plan
remains in progress, including durable release and remaining failure cases.

## Clean VPS coding and writeback

- A separately authenticated, ephemeral Codex 0.153.4 session discovered the
  adoption task and memory through native MCP without record IDs in its prompt.
- It cloned the public repository at
  `481b8e5a13d214bf97deab76a9cd3004cd1937f6`, checked the transported overlay's
  SHA256 `9e8d446dc1b482b8657065ac3583b3f06166a37b491be923eb74a929fa96e93b`,
  recovered the 26 approved files, and added three receipt regression cases.
- The 16 memory tests passed on the clean VPS; its full backend integration
  suite reported 220 passes. The original client reviewed and applied only the
  returned test patch, then independently reran the 16 tests successfully.
- Patch SHA256:
  `03283f65afce0cb8597a35d008210b7ccbc803589876961214b0e85e8b48ab03`.
  The final test file hash was
  `d89c20732d39f350057161c5b2fdd02f29e5d3067feea6303ad2609afa400bba`.
- The first native write was blocked by Codex's unattended approval policy,
  before Kody received it. No writeback was claimed. A second ephemeral session
  using `--approve-for-me` independently inspected the code, reran the 16 tests,
  saved a checkpoint through native MCP, and verified exact readback at work
  revision 15. The original client then read that same checkpoint, attributed to
  the dedicated clean-VPS connection.
- No prior Codex database, transcript, or authentication material was copied.
  The source overlay and installed skill were explicit setup artifacts.
- A third ephemeral session, using only native Kody reads with no shell or local
  files, retrieved revision 15 and correctly described the 16 passing tests,
  patch, and remaining limits. This completes original-client and subsequent
  fresh-session readback for the coding checkpoint.

Local evidence: `/tmp/kody-clean-vps-coding.jsonl`,
`/tmp/kody-clean-vps-recovery.jsonl`, `/tmp/kody-clean-vps-result.patch`,
`/tmp/kody-clean-vps-fresh-reader.jsonl`.
The Linux root verification run is separate from focused coding proof; the
original client's final isolated `pnpm verify` passed after applying the patch.
The redundant full-root run on the small VPS was stopped during its slow dashboard
typecheck; it is not a passing VPS-wide verification result.

## Deployed candidate

Production Convex `aware-raccoon-432` received the compatible backend changes.
Dashboard candidate `dpl_4tti3isgE4opT85VHUPEmtRDNADL`,
`https://kody-dashboard-b5o7zsi6y-aguy.vercel.app`, was deployed with
`--skip-domain`. It read the existing production plan memory successfully.

The real deployed browser create/verify/revoke journey passed. The public MCP
memory harness passed lifecycle/history/retry, concurrent create deduplication,
200-record pagination with retired exclusion, and deletion retry. All fixtures
were removed. A network failure made the harness token's revocation response
uncertain; revocation was reconciled through the backend and read back as revoked.
Separate deployed checks proved expired/revoked rejection and access to the same
memory after connection rotation; their fixture and three temporary tokens were
cleaned up.

Evidence: `/tmp/kody-deployed-mcp-browser.log`,
`/tmp/kody-deployed-memory-qualification.log`,
`/tmp/kody-continuity-backend-prod-deploy.log`,
`/tmp/kody-continuity-dashboard-deploy.log`,
`/tmp/kody-continuity-post-vps-verify.log`.

## Clean VPS provisioning

User approved the disposable VPS and $5 limit. Fly app
`kody-continuity-eval-20260912`, Machine `8654e02feee728`, was created in `ams`
at 2026-09-12T11:06:54Z from the official Node image
`node:24-bookworm@sha256:78d5a7a4c0dad680741f9fd398608d0d4e64a5db57575d12d3821178aa4f9110`.
It has 2 shared CPUs, 4GB RAM, no attached volumes or public services. Verified
configuration: `sleep 21600`, restart policy `no`, `auto_destroy: true`.
Its six-hour lifetime bounds compute spending; no continuous server was ordered.

Before installation, `/root/.codex` and `/root/.agents` were absent. Fresh
Codex CLI 0.153.4 and repository-pinned pnpm 9.0.0 were installed. Codex reported
`Not logged in`; a separate device login is awaiting the user. No previous
Codex state or credentials were copied. Provisioning was saved and read back
from Kody work revision 13. Provisioning is not coding-resumption proof.

## Verified observations

| Boundary | Evidence | Result |
| --- | --- | --- |
| Local native client | Codex CLI 0.153.2, native `kody_status`, action discovery and repository memory reads; temporary directory and no shell/file calls in the probe | Correct repository and continuity preference, memory `ebf94202-d1cf-4b30-9575-a93923822c3a` |
| Remote native client | Codex CLI 0.153.4 on existing Fly host; fresh ephemeral session with user config ignored, native Kody tools only | Found adoption work, latest checkpoint and plan; identified missing formal blockers |
| Cross-client knowledge | Remote probe retrieved adoption revision 9 and plan `2987ac29-a22c-486f-ae0a-aa7f2bf5765c` without supplied record IDs | Passed read-only rehearsal; no code continuation yet |
| Attribution | Dedicated Codex repository-only connection installed locally; remote probe used a temporary read-only connection | Remote token revoked after test; no personal grant |
| Live baseline failure | Disposable Kody-Engine-Tester memories through public MCP | Retirement returned `internal_error`; simultaneous identical creates produced two IDs; fixtures deleted and test token revoked |
| Retirement diagnostic | Production backend `aware-raccoon-432`; log request `d8cdfa80af742830` | `Revised memory does not match current memory` in backend revision validation |
| Release drift | Stable alias resolved to `dpl_5XfHJEL5YKUB9naDsXU5qnPjmiFW` | New permission fields rejected; prior `dpl_6TqJzMoFqSFXx5wKnk86H5nLq9vf` accepted them |
| Focused local fixes | Backend integration/store/registry tests, memory package tests, cursor integrity test | Passed; covers replay, deletion scrubbing, retirement history, 200 active records and expired search matches |
| Staging backend | Isolated candidate deployed to `animated-sardine-218` | Deployment succeeded; production backend unchanged |
| Live local persistence | Production-mode local app on port 3345, staging Convex, disposable Kody-Engine-Tester connection | Lifecycle/history/retry, concurrent create deduplication, 200-record pagination and retired exclusion, deletion retry passed; fixture cleanup complete and token revoked |
| Live negative cases | Same mounted MCP route and disposable staging fixtures | Changed-payload retry rejected, stale revision rejected, deleted create not resurrected, revoked token rejected with 401 |
| Native outage | Fresh ephemeral Codex CLI, unavailable MCP endpoint, native tools only | Reported unavailable context and no saved changes; did not invent a next step |
| Token creation diagnostic | Mounted local browser before final fix | POST sent no repository credentials before auth hydration; GET later sent them |
| Token creation correction | Mounted local browser after disabling creation until repository credentials exist | Real create/verify/revoke passed; mocked browser now asserts repository credentials on POST |
| Final isolated root checks | `pnpm verify`, final source plus local-only dashboard environment file | Passed; typecheck, lint, unit/integration and production build |
| Canonical browser gate | Final production build, isolated server on port 3344; no overlapping build | 153 passed; MCP mocked and live local journeys separately passed |

The initial remote rehearsal used an existing machine and its existing Codex login. It
is not a fresh VPS, fresh account authentication, or a completed coding journey.
No old source-machine Codex database or conversation was transferred.

## Validation in progress

An isolated candidate was assembled from source revision
`481b8e5a13d214bf97deab76a9cd3004cd1937f6` plus only this task's changes.
Final root verification passed in that isolated checkout. The local environment
file used for building is a secret input and must not be included in a transfer
artifact. Later clean-VPS and deployed candidate evidence is recorded above;
these initial local checks did not establish those outcomes by themselves.

The first canonical browser run had 152 passes and one unrelated test failure:
two valid New journey buttons matched a single selector. The test now scopes its
action to the Journeys header. A subsequent browser run was interrupted because
an overlapping rebuild replaced files being served; it is not qualification
evidence. The final browser rerun uses the completed build without a concurrent
build; it passed all 153 tests. Scoped executable files were compared with the
working checkout and matched the tested candidate. The local-only secret build
input was removed afterward.

The memory harness initially hit the documented rate limit. It now follows
Retry-After with bounded retries. All fixtures from both attempts were removed;
the successful run reports `failedCleanup: 0` and `cleanupIncomplete: false`.
The reusable harness is `apps/dashboard/scripts/verify-mcp-memory-continuity.mjs`.

Local evidence logs (not remotely available handoff artifacts):

- `/tmp/kody-isolated-verify-final.log`
- `/tmp/kody-isolated-browser-gate-qualified.log`
- `/tmp/kody-local-mcp-browser-final.log`
- `/tmp/kody-local-memory-qualification-2.log`
- `/tmp/kody-remote-native-probe.jsonl`
- `/tmp/kody-unavailable-native-probe.jsonl`

Fresh-checkout verification required building workspace packages that export
generated declarations; see `kody-mcp-codex-bootstrap.md`. Existing local build
output must not be treated as remotely available source.

## Remaining completion gates

- Native connection reload in the current desktop session is not proved by a CLI
  process; a new desktop task/session must discover the configured connection.
- Complete any remaining applicable release gates and public-domain promotion;
  targeted deployed MCP browser and persistence checks have passed.
- Release remotely reachable source and canonical skill; preserve real unfinished
  code with a verified revision or artifact.
- Finish explicit inaccessible-artifact and stale-memory recovery journeys;
  outage, interrupted/blocked save recovery, token expiry/revocation/rotation,
  and stale-revision rejection have focused evidence, with different layers
  identified above.
- Personal UI/MCP identity interoperability and complete native desktop state
  restoration are not qualified by this repository trial.

Shared progress is recorded in Kody Todo `kody-mcp-adoption-2026-09`.
