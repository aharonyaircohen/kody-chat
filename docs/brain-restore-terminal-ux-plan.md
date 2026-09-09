# Brain restore and terminal experience

Status: implementation in progress; reverified 2026-09-08. Browser reconnect, restore feedback, limited rollback, hosted Convex dispatch, and local background dispatch exist in the working tree. Execution recovery and terminal ownership defects remain reproducible; this is not complete pending deployment alone. See [the current architecture audit](terminal-brain-architecture-audit-2026-09-08.md).

## Implemented in this pass

- Restoring an image now announces a visible in-progress state and disables
  conflicting image actions while the request is running.
- The terminal is cleared and detached as restore starts, then reconnects with
  a fresh server session after restore completes. A failed restore leaves one
  clear “Try again” action.
- Terminal “Try again” now discards the old session identity, preventing a
  stale terminal from reappearing after machine replacement.
- The Images page reads the durable runtime operation when it refreshes, so an
  in-progress or failed restore remains visible after navigation or reload.
- The apply endpoint records the operation. Hosted requests enqueue a
  Convex-backed job and call a protected Dashboard worker; loopback requests
  use process-local background execution instead. The hosted job record is
  durable, but exclusive execution and restart recovery remain incomplete;
  local execution has no durable job. The callback address is captured from
  the request; no user-facing Dashboard URL setting is added. Recovery is
  attempted when the previous recorded image differs from the requested one;
  same-image reruns and unsaved filesystem recovery still need protection.
- Regression coverage passes for local terminal recovery, replacement-session
  freshness, and Brain Images restore feedback.

## Outcome

A user restores a saved Brain, sees understandable progress, and receives a working terminal on the restored Brain automatically. Reloading the page does not lose the operation. An old terminal never appears to be the new working terminal.

This is the detailed delivery plan for the restore/reconnect portions of [Terminal and Brain images stabilization](terminal-brain-images-stabilization-plan.md). It extends that plan, rather than replacing its unfinished snapshot, credential, rollback, and operation-recovery requirements. Existing local fixes for input ordering, terminal selection, repeated errors, and removal of the history panel remain prerequisites.

## Current evidence and limits

The hosted job remembers the Dashboard address from the request that created
it. Users do not configure a Brain or Dashboard URL. Hosted Convex needs a
reachable callback. Loopback requests currently bypass the job via `after(work)`
with a detached promise fallback; this avoids a callback to localhost but does
not survive a Dashboard process restart. Local and hosted recovery need
separate verification and equivalent ownership guarantees.

The dashboard worker remains the owner of Fly credentials and provisioning
logic. The existing Fly terminal bridge continues to perform long image-copy
commands; moving full Brain provisioning into that bridge would duplicate
credential handling and machine lifecycle logic.

The user reports restore followed by “Terminal could not connect,” then a frozen old terminal after “Try again.” That exact failure still needs a captured end-to-end reproduction; the source findings below establish gaps, not proof of every step in the reported incident.

| Current boundary | Verified source behavior | Required correction |
| --- | --- | --- |
| Image page | Apply returns 202; Images polls the recorded operation and emits local window events on completion | Observe authoritative operation and runtime changes outside this page and across tabs |
| Restore execution | `image-apply.ts` waits for Brain HTTP health and completes the operation | Establish terminal capability readiness separately; HTTP health alone does not prove an interactive shell |
| Runtime owner | `runtime-store.ts`, `runtime-manager.ts`, and `runtime-authority.ts` already own durable personal Brain state | Extend these owners; do not introduce another authoritative lifecycle store |
| Runtime model | Operations currently have running/completed/failed status, without persisted execution stages or runtime replacement generation | Record stage, authoritative target identity, and recovery facts |
| Terminal selection | Logical Brain transport remains `brain` across a machine replacement | Preserve the user’s Brain selection while changing the underlying terminal identity |
| Retry | Generic retry calls `retryRemote()`; `retryNow()` retains identity/session unless explicitly reset | Resolve current runtime before deciding whether to resume or create a fresh session |
| Connection ownership | `use-terminal-session.ts` creates a client from active state, conversation, and transport key | React to authoritative runtime replacement, not just a stable logical target key |
| Long operation | Apply route has `maxDuration = 300`; the recorded real image-transfer test exceeded five minutes | Durable work must outlive the initiating HTTP request |
| Image verification | `runtime-authority.ts` compares saved-image tags for drift | Use verified full image identity/digest mapping, including GHCR-to-Fly registry copies |

The earlier advice that every failed connection means restore failed was too broad. A restored Brain may be healthy while the browser’s terminal connection is unavailable. Those conditions must remain distinguishable.

## User experience contract

Keep the existing Images page using `PageShell`/`PageHeader` (standard-content type, `/secrets` reference) and the existing embedded terminal. No new page structure or user-facing technical controls are needed.

1. **Choose a saved image.** Use one consistent action, “Restore image.” Confirmation identifies the image and explains that running programs will stop and unsaved filesystem changes may be lost under the documented snapshot contract. It does not promise recovery of running processes.
2. **Accept the restore.** Immediately block terminal input and conflicting actions in the initiating view. Persist the operation before external mutation; other views observe the same accepted operation.
3. **Show actual progress.** Use “Preparing image,” “Replacing Brain,” “Starting Brain,” and “Checking terminal.” Show the current stage and elapsed time, not invented percentages or completion estimates. Technical diagnostics are available under details.
4. **Retire the old terminal.** Its old output disappears from the active terminal area as the restore begins. It cannot regain focus or accept input. A fresh prompt is shown only for the verified replacement. Do not restore the deleted history panel.
5. **Open the replacement automatically.** Keep an already open terminal selected. After runtime readiness, connect a fresh session and enable typing only after the terminal protocol proves readiness. If the terminal was closed, keep it closed and offer “Open terminal” on success.
6. **Stay truthful on failure.** Show the current Brain condition and one appropriate recovery action. A terminal-only retry never repeats image restoration.

### States and recovery actions

These are presentation states derived from runtime and connection facts, not a second durable state machine.

| What happened | Images page | Terminal area | Recovery |
| --- | --- | --- | --- |
| Restore accepted/in progress | Stage + elapsed time | “Brain is restoring” | No setup or generic retry while restore owns the Brain |
| Operation status cannot be read | “Checking restore status” | Input blocked; no stale output | Recheck status; do not launch another restore |
| Preparation failed before replacement | “Restore failed; previous Brain is still running” only after verification | Reconnect to the verified previous Brain | Retry restore on Images page after fixing the cause |
| Replacement failed and recovery succeeded | “Restore failed; previous Brain recovered” | Fresh connection to recovered runtime | Retry restore on Images page |
| Replacement/recovery left no usable Brain | “Brain needs recovery” | “Brain is unavailable” | Recover through the existing Brain operation owner |
| New Brain healthy, terminal capability not ready | “Brain started; terminal needs attention” | Explain the capability failure | Repair only the verified missing capability; do not replace the Brain |
| New Brain/terminal capability ready, browser connection failed | Restore remains successful | “Terminal disconnected” with no stale interactive screen | “Reconnect terminal” resolves the current runtime and fresh authorization |
| Current session disconnected, same healthy runtime | Current image stays running | Reconnecting, then a bounded failure if needed | Resume only if that session is confirmed alive; otherwise create a new shell |
| Credentials denied | Explain the affected credential without displaying secrets | Input blocked | Open existing Personal Credentials |

No automatic retry may replay uncertain shell input, repeat a destructive restore, or silently fall back to another terminal target. Temporary connection failure must not turn a healthy Brain into a failed restore.

## Ownership and technical contract

### Existing owners

- `packages/brain`: accepted restore, durable progress, image identity, current runtime, recovery, and capability health.
- Existing Convex personal-state storage: atomic operation acceptance and guarded updates, owned by authenticated Kody identity.
- `packages/terminal` plus the existing Fly bridge: authorized terminal session creation, freshness, protocol readiness, input/output delivery, and session disposal.
- Terminal registry/client: present the selected target, observe runtime identity changes, dispose obsolete connections/screens, and reconnect appropriately.
- `BrainImagesManager`: request and display the operation; it does not own background execution or decide runtime truth independently.

Use a shared client read/subscription adapter for the existing runtime authority. Browser events may accelerate refresh, but are not correctness or persistence boundaries. Preserve repository context while keeping Brain ownership personal. Use the existing PAT and Fly credentials.

### Extend runtime facts

Finalize field names after checking existing schemas and callers. The contract must contain:

- Operation ID, request idempotency key, requested image identity, status, stage, timestamps, heartbeat, and typed failure/recovery information.
- Previous verified runtime reference and replacement candidate reference. Candidate and ready runtime must not be confused.
- A monotonic Brain runtime generation (or equivalent explicit replacement identifier), separate from a shell session’s generation. Machine ID alone may not distinguish a restart/replacement using the same external identifier.
- Image provenance/digest mapping sufficient to verify the requested saved image against its prepared runtime image.
- Separate Brain-service and terminal-capability readiness. Browser socket availability remains client-local and must not rewrite global restore success.

Every progress/completion update must match the originating operation and expected runtime generation. Old callbacks cannot overwrite a newer restore. During replacement, session creation resolves fresh authoritative state and rejects obsolete targets even if a browser has not yet received an update.

## Implementation sequence

### 1. Reproduce and pin the failure — medium complexity

Capture the real restore request, operation ID, old/new machine and runtime identity, terminal session identity, lifecycle events, and readiness results in a disposable Brain. Redact credentials and signed connection URLs. Record whether the old screen is merely still painted or the socket is actually bound to the old machine.

Add boundary regressions before changes: ready old session → restore starts → replacement → reconnect. Include a delayed old socket event and a generic retry with stale identity. Preserve the prior local-terminal and history-removal regressions.

Exit: the reported symptom is reproduced or its exact missing reproduction condition is documented; deterministic tests cover the verified source gaps.

### 2. Establish one durable restore operation — high complexity

Extend `runtime-store.ts`, `runtime-manager.ts`, `runtime-authority.ts`, and their existing Convex persistence boundary. Persist acceptance, stage, candidate, generation, and recovery facts. Reuse existing compare-and-save logic, strengthening the atomic mutation where required.

Change the existing apply route to return an accepted operation promptly. Inspect existing execution/scheduling facilities and select the supported continuation mechanism before implementation; do not run detached work inside a request or use gateway memory as the only job record. Persist external execution identity and reconcile it after interruption.

Guard save, restore, reset, setup that mutates infrastructure, and teardown against conflicting operations. Repeated submission returns the same operation. Stale heartbeat means “checking status,” not automatic failure/unlock. Resolve uncertain external outcomes before repeating side effects.

Exit: navigation, reload, lost responses, two tabs, and worker/gateway restart preserve one truthful operation. There is no permanently locked running operation without recovery.

### 3. Make replacement and readiness authoritative — high complexity

In `image-apply.ts` and existing Fly provisioning:

- Prepare and verify the image before disrupting the previous runtime.
- Persist the recovery boundary before replacement; advance/invalidate the active runtime generation when replacement starts.
- Publish real stage transitions from execution, not client timers.
- Verify service health, requested image identity, and terminal capability on the candidate runtime.
- Use a structured agent/PTY readiness check. Do not type probe commands into the user’s shell or history. A gateway socket opening is insufficient.
- Complete only after the required backend readiness checks pass. Preserve a healthy new Brain if only the terminal capability needs repair, and expose that condition accurately.
- Resume/adopt an already completed external step after interruption rather than creating a duplicate machine.
- Reuse the umbrella plan’s previous-runtime recovery, volume protection, and unsaved-rootfs boundaries. Do not claim rollback protects unsaved changes unless a recovery capture proves it.

Exit: success refers to the actual replacement and its verified capabilities; every failure identifies whether the previous Brain, new Brain, or neither is available.

### 4. Invalidate and rebuild terminal sessions correctly — high complexity

Update the existing session endpoint/connector, terminal protocol, registry, `use-terminal-session.ts`, and `terminal-session-client.ts` together:

- Subscribe to Brain operation/generation changes independently of the Images page.
- Block input immediately on restore acceptance; reject stale input server-side once replacement begins.
- Dispose the old client, timers, socket listeners, pending input, and painted screen. Ignore late events using subscription identity and runtime generation checks.
- Keep logical target “Brain terminal” selected. Reset remote session identity, replay cursor/revision, shell modes, and capture buffers when the runtime changes.
- Resolve the latest runtime and issue fresh scoped authorization before reconnecting. Reconcile current state on tab focus/reload and before retry.
- For same-runtime network loss, preserve the shell only after a liveness check. For a changed runtime or dead shell, create a fresh session automatically.
- Do not deliver old queued commands to the replacement. Give an explicit uncertain-delivery message if an in-flight command cannot be confirmed.
- Enable input only after the new session is ready and its rendered terminal is mounted/fitted. Keep connection checks out of user history.
- Bound connection attempts and deadlines. Exhaustion retains the useful cause and offers the correct recovery action; it never exposes a frozen screen as ready.

Exit: restore with an open terminal requires no manual reconnect; delayed old output/input cannot enter the new session; ordinary reconnect remains nondestructive.

### 5. Apply one clear visible flow — medium complexity

Update `BrainImagesManager.tsx`, the existing terminal host/view, and startup issue presentation to use the shared runtime view.

- Replace the row-only spinner and premature success toast with the operation state from the table above.
- Retain operation progress when leaving/reopening Images; render the same state in the terminal area.
- Disable all conflicting image actions, not just the clicked row; enforce the same rules server-side.
- Remove restore-time “Try again” and misleading setup actions. Keep terminal-only reconnect when the runtime is healthy.
- Do not allow terminal setup to replace a healthy Brain merely to install/repair the gateway or agent. Audit the existing `setup-terminal` provisioning path before enabling any repair action.
- Keep the active image label tied to verified running image identity. Show pending desired image separately only while a restore is active.
- Use existing theme tokens, accessible status announcements, keyboard focus handling, and responsive layouts. Return focus only if the user is still working in the terminal.
- Keep raw diagnostics collapsed. No checkpoint/history window or new infrastructure controls.

Exit: users can identify what is happening, whether typing is safe, and the single useful next action without knowing machine IDs or token terminology.

### 6. Verify the whole journey and release — high complexity

Build regressions during every phase. Run the complete combined matrix before declaring the experience complete:

| Scenario | Required assertion |
| --- | --- |
| Restore while terminal is open | Old screen/input retired; new runtime opens automatically; command executes once |
| Restore while terminal is closed | Operation finishes without opening an unwanted panel; Open terminal targets the replacement |
| Reload/navigate during each stage | Same operation and progress return; no duplicate restore |
| Restore lasts over five minutes | Continues beyond request lifetime and reaches a verified result |
| Two tabs/conversations | Both retire stale sessions; neither sends input to an obsolete runtime |
| Double-click/conflicting save/reset/delete | Exactly one mutation accepted; useful conflict response |
| Old events arrive after replacement | No old output, error, or ready signal affects the new terminal |
| Network loss on same runtime | Live shell can resume; dead shell gets a fresh session; no input replay |
| Expired token/access denial | Fresh authorization or correct credential action; no image replacement |
| Service healthy, agent missing/unhealthy | Accurate capability failure; repair does not destroy a healthy Brain |
| Browser socket failure after successful restore | Restore remains successful; reconnect uses current target |
| Failure before/after destructive boundary | Accurate availability and safe recovery; no false rollback promise |
| Process restart/lost completion/state-write failure | Reconciliation finds/adopts actual outcome; no stuck operation or duplicate machine |
| Account/repository switch | Correct personal Brain isolation and repository context; stale credentials rejected |
| Clear, resize, paste, interactive shell | Correct cursor/input order, no duplicate commands or diagnostic history |
| Legacy image/runtime records | Explicit compatibility behavior; no guessed ready generation or destructive migration |

Run the repo-required `rtk pnpm verify`, `rtk pnpm --filter kody-dashboard test:e2e:gate`, and `rtk pnpm --filter kody-dashboard test:e2e:live:gate`. Configure an explicit non-production live target and disposable resources before destructive tests. Preserve evidence and clean up only test-owned resources.

The current browser-suite baseline is 143 passed and two failures in Facebook Connections and Memory; report them separately and do not call that suite green. Live-test preflight requires the expected URL, mutation target, and confirmation configuration. Passing a mocked terminal test does not substitute for a real restore through the mounted local app, real Convex, Fly, and registry.

Deploy backward-compatible backend/gateway support before clients require the new contract. Reject unsupported protocol versions explicitly. Verify a deployed candidate before production completion; keep application rollback separate from Brain data recovery.

Final reporting must distinguish regression tests, typecheck/lint, production build, mocked browser suite, live local restore, and deployed live restore. The plan is complete only when the saved-image → replacement → usable-terminal journey and failure matrix satisfy the contract.

## Risks and implementation decisions

- **Highest risk:** crossing the destructive replacement boundary without recoverable state; use the umbrella plan’s recovery gate.
- **Highest risk:** a request-scoped executor or in-memory job cannot provide durable progress; selecting a verified continuation mechanism is required in phase 2.
- **High risk:** conflating Brain generation, shell generation, and browser subscription identity allows late events to appear current; keep their ownership explicit.
- **High risk:** “health passed” without terminal proof recreates the original misleading success; verify both boundaries.
- **Medium risk:** persisted legacy records and mixed gateway versions need compatible reads and explicit capability negotiation.
- **Medium risk:** global terminal readiness must not depend on one browser staying connected; service capability checks and browser connection status remain separate.

Delivery order is 1 → 2 → 3 → 4 → 5 → 6, with tests developed throughout. This is a coordinated backend and terminal lifecycle change, not a cosmetic cleanup. Exact time estimates should follow the durable-execution and recovery audit; no reliable hour estimate has been established.

## Approval boundary

This document records the approved implementation plan and the work already landed. Destructive verification still uses explicitly disposable resources under the existing testing policy.
