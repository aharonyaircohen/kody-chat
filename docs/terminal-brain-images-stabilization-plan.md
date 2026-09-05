# Terminal and Brain images stabilization plan

Status: implementation in progress. The complete seven-priority outcome is not implemented or live-verified. See the implementation checkpoint below.

## Outcome

A user can open a terminal, save their Brain, restore a saved image, and continue working without choosing a different machine accidentally, losing track of an operation, or receiving misleading setup instructions. Failures leave a clear, recoverable state.

Scope covers ROI priorities 1–7. Speed optimization and cosmetic polish are deferred. Existing terminal, Brain runtime manager, Convex storage, and image catalog remain the owners of their current responsibilities; do not add a parallel job system or credential store.

## Evidence and boundaries

The source audit identified the following concrete defects or gaps. Operational consequences marked as risks still need reproduction; they are not claims of observed data loss.

| Area | Source evidence | Consequence |
| --- | --- | --- |
| Restore token | `packages/brain/src/image-runtime.ts` omits machine ID for local registry execution; `packages/fly/src/plugin/terminal/bridge-stateless-script.ts` requires it | Explains the reported invalid-machine token error |
| Ownership | `packages/brain/src/image-apply-command.ts` prefers GitHub account; save uses Kody account | Risk of reading or targeting a different Brain |
| Concurrent restore | `packages/brain/src/runtime-manager.ts` completion reads the current operation without matching the originating operation ID | Risk of stale completion overwriting newer work |
| Replacement | `packages/fly/src/plugin/runners/brain.ts` destroys the machine to release its attached volume before creating the replacement | Failed creation can leave no usable machine; rollback is absent from this path |
| Save tracking | Gateway jobs use an in-memory map; `image-save-command.ts` starts execution before persisting its record | Restart or persistence failure can leave tracking disconnected from execution |
| Progress | Gateway buffers command output until exit | Save stages are not visible while work runs |
| Terminal errors | `terminal-session-client.ts` classifies some failures by message regex and otherwise offers setup | Incorrect recovery action for unrecognized infrastructure errors |
| Snapshot | `image-save.ts` archives a live filesystem with mount exclusions and tolerates changing files | Exact restore behavior and consistency are not established |

Previous successful save and terminal checks did not verify the full restore journey. Existing mocked tests do not establish agreement between the actual restore token producer and gateway validator.

## Product contract to implement

### Ownership and credentials

- The authenticated Kody user owns personal Brain state, operations, and terminal access.
- Verified GitHub identity determines registry ownership and package access, never personal Brain ownership.
- Use the existing connected PAT for registry work. Do not introduce a user-facing `GHCR_TOKEN` credential.
- Fly organization, app, machine ID, and machine generation are explicit runtime targets resolved by the existing Brain service.
- Repository route context must be preserved without turning a personal Brain into a different Brain per repository.
- Never infer ownership merely from a matching app-name prefix, package name, or supplied machine ID.

### What an image means

The intended contract is a restorable filesystem environment: installed tools, supported system configuration, and workspace files, including modifications and deletions. It is not a checkpoint of running processes or terminal screen contents.

Persistent authentication remains separately owned by the user's existing credential storage and volume. Restoring an image must not replace that identity with credentials captured from another environment. Temporary files, sockets, runtime caches, and injected secrets are excluded.

Before implementation, inventory actual mounts and filesystem paths and document the inclusion/exclusion list. Verify how rootfs changes, package removal, symlinks, permissions, ownership, and mounted workspace data are represented. If the current capture method cannot satisfy this contract, change the capture method rather than silently weakening the meaning of restore.

Saving must either capture a consistent state or visibly fail/retry when consistency cannot be established. Do not claim that an actively changing archive is an exact recovery point. Determine the minimum required write pause from the actual storage/process layout and disclose any interruption in the save flow.

### Visible behavior

- Opening a terminal attaches to the current Brain. It never starts an image replacement implicitly.
- Setup is offered only for a verified missing capability. Temporary network failures offer retry; credential failures point to the existing credential surface.
- Save reports actual stages and remains trackable after navigation or reload.
- Run image reports preparation, replacement, readiness, and recovery. Success means the requested image is healthy on the authoritative machine.
- Conflicting actions are disabled in the UI and rejected safely by the server.
- Preserve the existing terminal surface. For changes to the image manager layout, use the standard-content page type, `/secrets` as reference, and `PageShell`/`PageHeader`; retain the existing image-list behavior without adding a new page type.

## Delivery sequence

The ROI ranking is not the dependency order. Define restore semantics first, build cross-boundary tests alongside each phase, and optimize only after the complete journey passes.

### Phase 1 — Fix restore ownership and authorization (priority 1)

1. Trace personal context through save, list, apply, runtime lookup, and terminal session creation. Separate Kody ownership from GitHub registry identity in their existing input contracts.
2. Make apply use the same authoritative personal Brain target as save and terminal.
3. Define operation-specific token requirements in the existing terminal package. Interactive connections require machine/session scope; gateway-local registry operations require their own limited operation scope. Do not use a dummy machine ID or disable validation globally.
4. Have token producers and the deployed gateway consume the same contract, including expiry, signature, audience, ownership, and supported operation type.
5. Validate registry access before starting expensive work, with a precise error for the existing PAT.
6. Coordinate gateway rollout with token changes so old gateways cannot silently reject new valid requests. Reject unsupported versions with an actionable compatibility error.

Acceptance: the real restore-produced token passes the actual validator; wrong owner, wrong operation, expired token, and invalid signature fail. A user whose Kody ID differs from GitHub login saves, restores, and connects to the same Brain. A second user cannot operate that Brain.

### Phase 2 — Serialize changes and persist operation ownership (priorities 2 and 6)

1. Extend the existing Convex-owned runtime operation record; inspect its mutation boundaries before selecting the exact schema.
2. Atomically acquire one mutating operation per Brain, with operation ID, request idempotency key, target generation, phase, timestamps, and recovery information.
3. Include save, apply, reset, and teardown in the conflict rules. Terminal attachment remains allowed where safe; reconnect is coordinated during replacement.
4. Require the originating operation ID and expected generation on every progress, completion, and failure update. Ignore/reject stale updates.
5. Persist intent before external work. Repeated requests return the existing operation instead of launching duplicate work.
6. Record external execution identity and reconcile uncertain outcomes after process restart. Do not blindly rerun a potentially completed upload or replacement.
7. Persist catalog completion and operation completion atomically where they share Convex storage. Reconcile external registry success separately because it cannot be part of that database transaction.
8. Publish bounded, redacted progress as output arrives. Bound stdout and stderr memory, and define cancellation/timeout cleanup for child processes and remote work.
9. Recover through the existing operation owner without relying on the image page remaining open. Select the existing scheduling/reconciliation mechanism after inspecting available infrastructure; do not invent another scheduler.

Acceptance: double-click creates one operation; conflicting requests cannot both mutate the Brain; stale completion cannot change current state; reload and gateway restart preserve a truthful outcome; registry success followed by a database failure is reconciled without duplicate images.

### Phase 3 — Establish dependable snapshot semantics (priority 7)

1. Inventory rootfs, workspace mounts, persistent auth volume, injected secrets, and runtime-generated files.
2. Implement the documented inclusion/exclusion and consistency policy. Audit image contents for credential leakage without printing secrets.
3. Preserve filesystem deletions as well as additions; verify the actual image-layer behavior rather than assuming an appended archive is an exact snapshot.
4. Persist image digest, format version, source runtime information, and capture metadata in the existing catalog. Use immutable digest identity for restore verification.
5. Test tools, file contents, deletions, permissions, symlinks, and persistent-volume behavior in a disposable Brain.
6. Define compatibility handling for existing images before changing their catalog representation.

Acceptance: a fixture environment restored from an image matches the declared snapshot contract. Credentials and transient files are absent from the image. An inconsistent or unsupported capture cannot be reported as a verified recovery point.

### Phase 4 — Recover from failed replacement (priority 5)

1. Resolve and validate the requested image, digest, registry permissions, runtime compatibility, capacity, and volume requirements before disrupting the current machine.
2. Persist a recovery record containing the previous machine configuration, image digest, volume identity, and authoritative runtime generation. Keep secrets in existing protected storage, not user-visible operation logs.
3. Inspect supported Fly lifecycle operations to choose the least destructive volume handoff. Do not promise two simultaneous machines sharing a single-attach volume.
4. Once disruption begins, record each external step so restart recovery can determine whether to resume, adopt a healthy replacement, or recover the previous runtime.
5. Validate both service health and the terminal capability before committing the new runtime as ready.
6. On failure, attempt restoration of the previous runtime configuration. Preserve the volume. If recovery also fails, retain the recovery record and show an explicit recoverable failure rather than reporting the previous machine as running.
7. Define the limits of rollback: recreating a previous image does not necessarily recover unsaved rootfs changes. Protect those changes with a verified recovery capture or explicitly stop before destruction when that protection is unavailable.

Acceptance: inject registry-copy, machine-create, volume-attach, readiness, and state-write failures. Each leaves either a verified working runtime or an accurate failure state with retained recovery material. No false success and no automatic volume deletion.

### Phase 5 — Make terminal recovery predictable (priority 4)

1. Propagate typed error codes from the transport through the existing terminal protocol to the UI. Separate missing machine, starting machine, expired authorization, denied access, unavailable tunnel, and missing terminal agent.
2. Resolve the latest machine generation on reconnect; refresh authorization when necessary without creating another Brain.
3. Use bounded retries and connection deadlines. Preserve the most useful failure reason when the socket closes.
4. Keep one active subscription and clean up prior listeners/sockets. Define input acknowledgement behavior; never automatically resend uncertain shell input because it may execute twice.
5. Verify that screen snapshots replace screen state, history captures do not append duplicate snapshots, and clear does not inject shell commands.
6. Verify resize, cursor placement, focus, multiline input, interactive programs, and reconnect. Keep Fly diagnostics out of shell output/history.
7. Make any required gateway tunnel recovery reproducible through managed configuration or explicit recovery behavior; a manual daemon restart is not a completed reliability fix.

Acceptance: timeout recovers without setup; replaced machine reconnects to the new target; typing `ls` executes once; clear does not add junk history; resize and reconnect do not move input to the wrong position; unavailable service exits loading with an accurate action.

### Phase 6 — Full journey proof and release (priority 3)

Build the fixtures and regression tests during phases 1–5. This phase is the combined release gate, not the first time testing happens.

| Journey | Required evidence |
| --- | --- |
| Fresh setup and terminal | Real Brain starts; terminal accepts input once |
| Save and reload | Image appears, digest is recorded, progress survives navigation |
| Change and restore | Saved files/tools return; post-save changes follow documented restore semantics |
| Restore and reconnect | Terminal targets the authoritative replacement; login-volume behavior is correct |
| Two users / account switch | Catalog, Brain, operation, and terminal authorization remain isolated |
| Double-click / conflicting actions | One accepted mutation; safe response for the other |
| Interrupted operation | Dashboard reload, gateway restart, and uncertain response converge to one truthful result |
| Failed replacement | Recovery works or accurately reports its remaining blocker |
| Fly timeout / token expiry | Correct retry or credential action; no misleading setup |
| Terminal clear / resize / disconnect | No duplicate commands, injected probes, or duplicated history |
| Legacy image | Compatibility classification is honest and supported restore is verified |

Use dedicated test accounts, repositories, apps, and volumes for destructive cases. Record pre-test state and cleanup only resources owned by the test. Real local tests must traverse the mounted UI, real routes, Convex, and Fly/GHCR without intercepting feature requests.

Required commands from the repository testing policy:

```sh
rtk pnpm verify
rtk pnpm --filter kody-dashboard test:e2e:gate
rtk pnpm --filter kody-dashboard test:e2e:live:gate
```

Run the applicable live matrix before changes, after each architecture phase, and against the deployed candidate. Confirm the live-test environment and mutation-target configuration before destructive tests. Missing credentials or unavailable capacity are blockers, not passes.

The final report must separately state regression test, typecheck, lint, production build, mocked browser test, live local test, and deployed live test results. No phase is complete based only on source inspection or mocked tests.

## Compatibility and rollout

- Inventory existing personal-state keys, runtime records, images, and gateway versions before migration.
- Only move legacy records when authenticated ownership is proven. Do not merge accounts based on matching GitHub names or app-name patterns.
- Preserve existing image references and metadata. Mark unverified legacy snapshot semantics explicitly; do not relabel old images as newly verified snapshots or delete them automatically.
- Publish compatible gateway support before switching token producers, or use an explicit version handshake that prevents a broken mixed rollout.
- Keep migration retries idempotent. Runtime state stays Convex-owned; no GitHub fallback, bootstrap, or dual-write.
- Keep the last verified application/gateway release available for code rollback, separately from per-Brain restore recovery.
- Pilot on disposable resources, then the deployed candidate. Broader release requires the complete journey and failure matrix to pass.

## Decisions to settle through implementation evidence

These are investigation tasks within the plan, not reasons to stop planning or invent behavior:

1. Exact mounted-data inclusion and a safe filesystem consistency strategy.
2. Existing Convex atomic mutation and reconciliation facilities suitable for operation ownership.
3. Fly volume handoff and recovery behavior supported by the current deployment.
4. How legacy image metadata identifies recoverable content and provenance.
5. Gateway version rollout and terminal protocol compatibility across the actual deployed versions.

If evidence shows the intended contract cannot be met without changing what users save or risking unsaved data, record that specific tradeoff before implementation proceeds past the affected boundary.

## Completion definition

All seven priorities are complete only when the real save → change → restore → terminal journey passes locally and on the deployed candidate, interruption cases recover predictably, and the UI reports the verified runtime and operation state. Performance improvements remain a later workstream.

## Implementation checkpoint — 2026-09-05

Changes remain local and are not a release-ready completion of this plan.

| Priority | Current code | Remaining work |
| --- | --- | --- |
| 1 | Restore preserves Kody ownership separately from GitHub identity; shared token validation permits machine-free local jobs and denies their interactive use; restore registry credentials use a private temporary auth file | Live restore, account-isolation matrix, deployed gateway/backend compatibility |
| 2 | Convex compare-and-save; save/apply operation exclusion; originating operation ID required on apply completion; save intent precedes dispatch; gateway accepts idempotent job IDs | Reset/delete/teardown conflict coverage, atomic catalog/save/operation completion, interrupted-operation recovery |
| 3 | New failing-before-fix regressions; real local gateway process/HTTP test; five terminal browser scenarios passed in the broad gate | Full save/change/restore journey, failure injection, deployed candidate |
| 4 | Typed transport failure retries; unspecified startup failures no longer prescribe setup; verified missing-agent code retains setup | Live reconnect/expiry/deadline matrix and managed tunnel recovery |
| 5 | No replacement behavior changed | Recoverable volume handoff, protection of unsaved rootfs changes, rollback and failure injection |
| 6 | Streaming stdout/stderr progress; both streams bounded; intent recorded before execution | Gateway restart durability, autonomous reconciliation, cancellation/process cleanup |
| 7 | Read-only live mount inventory completed | Capture consistency, deletion semantics, image digests/format version, legacy compatibility, credential-content audit and restore proof |

Read-only Fly inspection confirmed the current Brain has an overlay root filesystem; `/workspace` is on that same filesystem and `/root/.codex` is a separate ext4 mount. No restore or destructive test was run against that Brain.

Verification checkpoint: focused regressions and a real local gateway HTTP process test passed. The broad production browser gate reported 123 passed and 21 failed; all five terminal setup/recovery scenarios passed. Other reported failures include duplicate model-picker options. This gate is failed, not waived.

Final local `pnpm verify` exited successfully after the source changes: typecheck, lint, unit/integration suites, and production build passed. Logs: `/tmp/brain-stabilization-complete-checks.log`; browser gate: `/tmp/brain-stabilization-final-browser.log`. Live local save/restore and deployed live verification are not run.

The live gate refuses to run without `KODY_LIVE_EXPECTED_BASE_URL`, `KODY_LIVE_MUTATION_TARGET`, and `KODY_LIVE_CONFIRM_MUTATIONS`. A disposable account/Brain is still needed for replacement and filesystem-loss tests. The existing user Brain must not be treated as disposable merely because the mounted UI session is labelled QA.

Do not deploy the partial operation exclusion without finishing recovery: an uncertain dispatch or interrupted apply currently retains its running operation conservatively; automatic recovery/unblocking is still required. The backend comparison argument must be supported on the target Convex deployment before callers send it.

Registry implementation references: [Skopeo auth-file options](https://raw.githubusercontent.com/containers/skopeo/main/docs/skopeo-copy.1.md), [Fly token normalization](https://raw.githubusercontent.com/superfly/fly-go/master/tokens/tokens.go), and [Fly CLI v0.4.50 Docker authentication](https://raw.githubusercontent.com/superfly/flyctl/v0.4.50/internal/command/auth/docker.go). Fly CLI's no-Docker fallback writes to the home directory, so restore now authenticates Skopeo directly into the operation's temporary file.

## Disposable live test checkpoint — 2026-09-05, after approval

The user approved creating and deleting a temporary Brain. A separate test account was created through the existing internal QA provisioner, with its own personal credentials and Brain state. The actual local UI provisioned `kody-brain-qa-0905-flow`; the original personal Brain was not used for destructive tests.

The real journey exposed three additional defects:

- A custom name starting with `kody-brain-` was rejected after provisioning as though it belonged to another account. New app records now retain the provisioning account; target resolution uses that ownership while preserving the legacy guard for old records. Both matching and mismatched ownership have regression coverage.
- Brain Images required a repository Fly token even though its API uses personal credentials. The page now calls the personal Brain API directly, including when repository auth is absent. Its existing `PageShell` layout remains unchanged. The desktop and mobile regression failed before this change and passed afterward.
- The first real restore failed while uploading a blob to Fly's registry (`unexpected EOF`). The old test machine remained intact. Image preparation now allows three attempts for transient transfer errors, stops immediately for permission errors, and keeps signed upload URLs out of the user-facing error. Executable Bash regressions cover recovery, exhaustion, and permission rejection. A second real restore succeeded.

Live evidence through `http://localhost:3333/repo/aharonyaircohen/kody-chat/fly/brain-images`:

- Terminal input produced exactly the typed bytes; the test command executed once; Clear injected no shell input.
- Save completed in about nine minutes. Its image appeared after a fresh page load.
- Run image completed on the second real attempt and displayed the saved image as running.
- The authoritative machine changed from `82949df77003e8` to `84929ef2244158`.
- A file created in `/workspace/repo` after capture was absent after restore; a separate marker in `/root/.codex` survived.
- The restored terminal executed a command once and remained usable after viewport resize, without page errors.

Cleanup completed: the temporary Fly app returned 404, the exact test GHCR version was deleted with the original five tagged versions retained, and test credentials and Brain metadata were cleared before deleting the test account. The shared terminal gateway was updated by the real setup flow and was retained.

Final checks for this checkpoint:

| Layer | Result |
| --- | --- |
| Regression / unit / integration | Passed in `pnpm verify`, including the new target, credential-gate, and executable upload-retry regressions |
| Typecheck / lint | Passed |
| Production build | Passed |
| Mocked browser gate | Failed: 142 passed, 2 failed (Facebook connections and Memory); affected terminal and image scenarios passed |
| Live local affected journey | Passed after the first upload failure and the retry change |
| Full mandatory live matrix | Not run; this targeted Brain journey does not replace it |
| Deployed dashboard candidate | Not run |

Logs: `/tmp/brain-qa-followup-final-verify.log`, `/tmp/brain-qa-followup-final-browser.log`. Private screenshots and test evidence are under `/tmp/kody-brain-qa-FloWjd/`; test login credentials and browser session files were removed during cleanup.

This proves the tested happy path and the observed pre-replacement upload failure, not completion of all seven priorities. Durable recovery, asynchronous restore beyond the request lifetime, complete lifecycle exclusion, safe rollback after replacement begins, and exact snapshot/deletion consistency remain unfinished. No commit, push, or dashboard deployment was performed in this checkpoint.
