# Brain Runtime Stabilization Plan

## Outcome

A Brain change is complete only when the selected image is running, agent access
works, and a real terminal command succeeds after reconnect. Restore, terminal,
and image save share one durable lifecycle and one release gate.

## Ownership and contracts

| Responsibility | Owner | Contract |
| --- | --- | --- |
| Public Dashboard identity | `@kody-ade/base` | Derive a secure server origin without trusting the browser `Origin` header. |
| Desired and running Brain state | `@kody-ade/brain` runtime manager | Serialize per-user mutations and persist operation stage, attempt, error, and running target. |
| Restore execution | Convex `brainRestoreJobs` plus Brain image command | Lease one idempotent operation, resume the same operation after transient worker failure, and reject stale writers. |
| Fly machine and gateway | `@kody-ade/fly` | Provision or wake the requested target without replacing unrelated state; return typed failures. |
| User readiness | Brain lifecycle verifier | Require Brain health and agent access before runtime promotion, then websocket readiness and real terminal input/output before release qualification. |
| Release qualification | Dashboard live gate | Run the full lifecycle against an exact candidate and a disposable identity; skipped destructive proof fails a Brain release. |

Runtime state remains Convex-owned. GitHub and GHCR hold repository content and
saved images, not live operation state.

## Phases

### Phase 1: Trusted deployment identity

- Ignore the browser `Origin` header for server and agent callback URLs.
- Resolve a normalized HTTPS origin from trusted proxy/request data.
- Validate it before creating a durable restore operation.
- Use the same resolved origin in the queued worker and agent files.

Acceptance: a request with an insecure or foreign browser `Origin` header still
uses the mounted HTTPS Dashboard origin; an actually insecure deployed origin
fails before provisioning starts.

### Phase 2: Durable lifecycle stages

- Persist restore attempt and stage in the existing Brain runtime record.
- Record image resolution, service resolution, runtime image preparation,
  provisioning, agent setup, health verification, runtime recording, and
  recovery.
- Keep stage updates monotonic within an attempt and protect them with the
  existing optimistic revision check.

Acceptance: status APIs and failure records identify the last reached stage;
stale workers cannot move or complete a newer operation.

### Phase 3: Retry and recovery

- Resume the same failed operation when its durable Convex job retries.
- Preserve operation identity while incrementing the attempt.
- Keep the previous running target until the candidate passes Brain health and
  agent setup, then promote it atomically. Terminal readiness remains a
  separate postcondition so a gateway outage cannot corrupt runtime state.
- Classify retryable infrastructure failures separately from permanent input,
  authorization, and configuration failures.

Acceptance: interruption and retry do not end in `operation is no longer
current`, duplicate jobs remain deduplicated, and permanent failures do not
repeat expensive provider work.

### Phase 4: Complete lifecycle proof

- Add a registered Brain lifecycle journey: terminal marker write, image save,
  Brain destroy, image restore, reconnect, and marker read.
- Require a disposable GitHub/Fly identity and explicit mutation target.
- Assert the visible operation stage and final terminal output.
- Capture logs and artifacts for every failed stage.

Acceptance: the exact deployed candidate completes the full lifecycle. A skip,
missing credential, candidate mismatch, or cleanup failure is a failed gate.

### Phase 5: Release and operations

- Promote aliases only after the candidate lifecycle gate passes.
- Add metrics for stage duration, attempts, recovery, Fly API failures, gateway
  readiness, websocket closure, and total restore time.
- Run suspend/wake and restore/reconnect soak tests before broad rollout.
- Keep one rollback path: point users at the previously qualified runtime and
  candidate deployment.

Acceptance: operators can identify the failing stage and target from one
operation ID, and the release record links the candidate version to its live
artifacts.

## Required regression matrix

| Boundary | Required cases |
| --- | --- |
| Origin | hostile browser Origin, forwarded HTTPS host, direct HTTPS URL, insecure URL rejection, credentials rejection |
| Runtime state | overlap, stale writer, monotonic stage, failed-operation resume, retry attempt, completion |
| Queue | duplicate enqueue, active lease, stale lease, retryable failure, permanent failure, exhausted attempts |
| Restore integration | agent setup failure, GHCR failure, Fly timeout, health timeout, state conflict, previous-runtime recovery |
| Browser contract | progress, retry, actionable failure, reload during restore, terminal reconnect |
| Deployed lifecycle | save, destroy, restore, reconnect, persistent marker, cleanup |

## Release rule

Until Phase 4 passes on a disposable deployed target, Brain changes may be
reported as local candidates only. A terminal-only pass does not qualify image
restore, and a health endpoint does not qualify terminal readiness.
