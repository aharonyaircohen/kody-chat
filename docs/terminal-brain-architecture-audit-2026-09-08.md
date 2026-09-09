# Terminal and Brain images architecture audit — 2026-09-08

The Brain can be running while its terminal remains unusable. The current failures span the gateway connection, terminal recovery, and restore ownership; they are not one image-selection bug.

Status: investigation, not a repair or deployment. Audited working tree at `382798771`, including pre-existing uncommitted restore/UI/Convex changes. Engine source and the live Brain both report version `0.4.658`; matching version numbers alone do not prove identical deployed source.

## Reverification after further changes — 2026-09-08, 15:08 local

The full repair scope still applies. None of the original eight findings can be closed from the current source and fresh probes. The observations below supersede the initial audit where behavior changed; live observations in the next section belong to the earlier investigation and were not repeated during this reverification.

### Changes recognized

- Existing local restore feedback, terminal clearing, fresh-session retry, and limited rollback are retained. They improve the initiating view but do not provide cross-tab runtime ownership or complete recovery.
- Hosted restore dispatch now uses the job's captured Dashboard URL, without the former `KODY_LOOP_DASHBOARD_URL` override. This removes a competing callback destination.
- **Local restore now bypasses the durable job:** `packages/brain/src/routes/image-apply.ts` detects loopback origins and calls `after(work)`, falling back to `void work()` if registration fails. This avoids asking hosted Convex to call localhost, but makes local execution dependent on the current Dashboard process. A restart can strand the runtime operation; a local pass does not exercise hosted worker delivery or recovery. Preflight failures before the apply service's main `try` can also leave the runtime operation running because the local outer catch only logs.
- Engine Dockerfiles add `openssh-server`, and entrypoints invoke `/etc/kody-ssh/start.sh` when supplied. This completes part of the downloadable machine-SSH startup path. **The terminal gateway still invokes `flyctl ssh console`; it does not consume that SSH access configuration.** These changes therefore do not remove the failing tunnel dependency. No new image build/deployment was verified.
- SSH access adds concrete snapshot exclusions to verify: `/etc/kody-ssh` and the home-directory `.kody-ssh` contain machine-specific host keys and access material. Current rootfs capture excludes neither path. This is a source-established capture risk, not a claim that a particular published image contains keys; no private image was inspected.

### Fresh verification

| Layer | Current result |
| --- | --- |
| Existing focused regression/unit/integration suites | 33 passed: client 11, gateway 3, Brain 5, restore-job enqueue 1, Dashboard image assertions 13 |
| Original three client probes | All 3 still fail: diagnosis overwritten, stale subscription readiness accepts input, no silent-socket deadline |
| Engine shared-store probe | Still reproduces generation 2 → 1 after an old subscriber writes |
| Restore-handler probes | Still reproduce a second claim while running and an unrecovered final attempt |
| Typecheck/lint | Not run in this plan-only review |
| Mocked browser suite | Not run |
| Live local / gateway / deployed candidate | Not rerun; no current successful recovery claim |
| Image build / save / destructive restore | Not run |

The passing Dashboard assertions check source strings, including `after(work)`; they do not test restart survival. The passing restore-job test checks enqueue deduplication, not exclusive execution. Temporary client probes were removed from the active suite after rerunning; their source remains below.

### Revised execution requirements

1. Keep transport diagnosis, readiness deadlines, and gateway recovery first. Treat downloadable SSH as a separate capability unless an explicit terminal transport migration is designed and tested; installing sshd alone is not that migration.
2. Keep authoritative Brain-side session ownership and generation fencing. The engine session logic is unchanged and its race still reproduces.
3. Repair hosted worker leases, stale completion, exhausted attempts, preflight failure recording, and uncertain external-effect reconciliation. Bring local execution under equivalent durable ownership/recovery; do not preserve untracked background execution as the complete local solution. Deployment reachability is a server concern, not a new user-facing URL setting.
4. Retain shared runtime lifecycle observation across tabs, separate image/service/terminal readiness, safe same-image recovery, and exact snapshot semantics. Explicitly exclude injected SSH/access material and prove its regeneration after restore.
5. Verify both execution paths separately: a mounted local happy path cannot establish hosted worker correctness. Include process restart before/during local restore, failed local preflight, duplicate hosted delivery, lost response after successful replacement, final-attempt interruption, and saved images created before the SSH boot hook exists.

## Observed incident and confidence

- The user's open Comet tab at `http://localhost:3333/repo/aharonyaircohen/kody-chat/fly/brain-images` displayed the exact reported error, while Images displayed the saved image as running.
- Fly reports Brain machine `2862de5b41d208` in `kody-brain-user-416e31f3e4da1ccf` started, with 1/1 checks. Its image is `kody-brain-user-416e31f3e4da1ccf:20260905t115547z`.
- Direct SSH from this computer returned `kody 0.4.658`.
- Gateway `kody-terminal-aharon-yair-cohen-44fcef106eb9`, machine `e82d10e2b66038`, is started with 1/1 checks and gateway version `982c056a407cb767`. Independently hashing the current local gateway/start scripts produced the same version.
- A read-only version command through that deployed gateway failed after about 6.3 seconds with `tunnel unavailable: Error contacting Fly.io API when probing "personal": timed out (context deadline exceeded)`.
- The gateway's authenticated `/status` probe waited about 20.4 seconds, then returned HTTP 401 with `terminal status timed out`.
- Ordinary HTTPS requests from inside the gateway reached Fly's GraphQL endpoint in 193 ms and Machines endpoint in 32 ms. This rules out a blanket inability to reach those hosts at that time; it does not prove the CLI tunnel path healthy.
- Gateway logs show repeated suspension/resume, including resume on September 8 at 10:42 UTC. Its configuration explicitly uses automatic suspension and zero minimum running machines.

**Boundary:** the gateway probes used the existing local Fly CLI credential, encrypted with the gateway's configured launch-token secret. They did not extract or replay the browser's personal credential. This proves a live failure in this gateway-to-Brain path, but does not establish every detail of the user's original handshake. Stale tunnel/daemon state after suspension is a plausible hypothesis, not yet a proven root cause. No gateway restart, Brain replacement, or image restore was performed.

## Current end-to-end ownership

1. The Dashboard resolves the personal Kody account, saved Brain, Fly credentials, and live machine.
2. The terminal endpoint wakes the machine if necessary, locates a gateway, checks gateway HTTP health, and issues an encrypted short-lived connection token.
3. The browser opens a WebSocket to the gateway. The gateway launches a new `flyctl ssh console` process for each subscription.
4. SSH starts the Brain terminal agent. The agent uses tmux for the actual shell and a JSON file for session metadata, generation, screen, and revision.
5. The browser renders terminal events and requests another subscription after failure.
6. Image restore records a Brain operation in Convex. Hosted requests enqueue a restore job that calls a Dashboard worker; loopback requests now start process-local background work instead. Both prepare the registry image, replace the machine, wait for Brain HTTP health, and mark the operation complete.
7. The Images component emits browser-window events that clear/reconnect the active terminal around restore.

Tmux already keeps the shell outside the browser and gateway. The remaining problem is that lifecycle decisions and metadata writes are still spread across independently running clients and processes.

## Findings, ordered by repair priority

### 1. The transport failure is hidden by a second client error — proven

The gateway emits a useful `terminal_transport_unavailable` message before closing. On the final retry, the client first publishes that diagnosis, then `onclose` calls `retry("network connection closed")` and overwrites it. A focused failing regression reproduced the user's exact final string.

References: [client retry](../packages/kody-chat-dashboard/src/dashboard/lib/chat/plugins/terminal/terminal-session-client.ts#L207), [close handler](../packages/kody-chat-dashboard/src/dashboard/lib/chat/plugins/terminal/terminal-session-client.ts#L338), [gateway failure](../packages/fly/src/plugin/terminal/bridge-stateless-script.ts#L279).

Repair: retain the structured failure for the current attempt, record the failing stage, and let a close event supply a fallback only when no better diagnosis exists. The gateway status handler must distinguish authentication failure from transport timeout; it currently catches both as 401 and ignores child stderr/early exit while waiting for status.

### 2. A healthy gateway can have a broken Brain connection — live failure proven

Gateway `/healthz` is unconditional `{ok:true}`. Session creation verifies this shallow health but never verifies SSH/agent capability. Each retry launches another SSH process against the same gateway environment; there is no transport recovery owner or readiness negotiation.

References: [gateway health/status](../packages/fly/src/plugin/terminal/bridge-stateless-script.ts#L494), [gateway lookup](../packages/fly/src/plugin/terminal/bridge.ts#L405), [terminal connection](../packages/fly/src/terminal/session-connect.ts#L259).

Repair: make transport readiness and failure classification explicit in the existing gateway. Validate bounded recovery across suspension and tunnel loss. A manual daemon restart can be a diagnostic experiment, but is not the completed repair. Do not replace a healthy Brain to repair its gateway.

### 3. Reconnect lacks deadlines and can reuse old readiness — proven client defects

The request has no abort/deadline. The WebSocket has no readiness deadline or client heartbeat watchdog. A socket that opens but sends nothing stays connecting indefinitely. The client also retains the previous session's `ready` state; after a replacement socket opens, `sendInput` returns true before that subscription proves ready.

Focused regressions failed for both behaviors. The input result proves a client contract defect; it does not establish that the current UI actually submitted a command during the observed outage.

References: [request and lifecycle](../packages/kody-chat-dashboard/src/dashboard/lib/chat/plugins/terminal/use-terminal-session.ts#L118), [input guard](../packages/kody-chat-dashboard/src/dashboard/lib/chat/plugins/terminal/terminal-session-client.ts#L392).

Repair: independently track shell identity and current subscription readiness; invalidate readiness on disconnect; bound HTTP, handshake, first-ready, and liveness waits; cancel stale listeners/timers; never replay uncertain input automatically.

### 4. Multiple agents can overwrite one shell's generation — proven with shared-store probe

Each subscription spawns an independent agent with an in-memory copy of the same session metadata. Writes use atomic file rename, but there is no compare-and-save or single writer across processes. Per-process command serialization does not serialize two subscribers.

A probe opened two agent instances on one shared store. The second restarted the shell, recording generation 2. The first then captured output and rewrote the record to generation 1. Browser singleton rules cannot protect this boundary against two tabs or overlapping reconnects.

References: [gateway agent-per-socket](../packages/fly/src/plugin/terminal/bridge-stateless-script.ts#L239), [engine session owner](/Users/aguy/projects/kody2/src/terminal/brain-terminal-session.ts#L202), [file writes](/Users/aguy/projects/kody2/src/terminal/brain-terminal-adapters.ts#L79).

Repair: give each shell one authoritative session owner on the Brain, with subscribers attaching to it, or implement equivalent cross-process locking and fencing in the existing agent/store. Generation and output revision must never move backward. Preserve tmux as the shell owner.

### 5. The new restore worker is durable in storage but unsafe under repeated execution — proven handler defects

`claim` accepts an already-running job while attempts are below 3. `finish` does not require an attempt/lease identity. Dispatch retries the entire HTTP operation after any failure, including an uncertain response. The apply path with an existing operation ID checks the ID before external work but not that the operation is still running; completion's later guard is too late to prevent repeated external mutation.

Handler probes confirmed that two consecutive claims both succeed and that an interrupted running job at attempt 3 is ignored by stale-job recovery and remains running. These probes use a simulated database around the actual handler code, not a deployed Convex race test.

References: [claims, finish, recovery, dispatch](../packages/kody-backend/convex/brainRestoreJobs.ts#L35), [apply preflight](../packages/brain/src/image-apply.ts#L191), [worker route](../apps/dashboard/app/api/kody/brain/image/worker/route.ts#L24).

Repair: one atomic execution lease with attempt fencing, progress/renewal, and terminal handling of exhausted attempts. Persist external steps and reconcile actual machine/image state before retrying an uncertain restore. A completed operation must return its result without doing the replacement again. The five-minute HTTP worker deadline is still an execution limit even though the job record is durable.

### 6. Restore and terminal do not share an authoritative replacement lifecycle — source verified

The terminal host listens to a `window` custom event emitted by Images and affects only the active logical Brain terminal. A terminal in another tab does not receive it; a terminal without the Images component mounted does not observe its polling. The personal terminal route resolves the current machine but does not gate attachment against the active restore operation. Reconnect rejects a changed session ID rather than adopting an authoritative replacement unless another layer explicitly resets the client.

References: [window event listener](../packages/kody-chat-dashboard/src/dashboard/lib/components/kody-chat-terminal-host.tsx#L204), [Images polling](../apps/dashboard/src/dashboard/features/admin/components/BrainImagesManager.tsx#L219), [terminal route](../packages/brain/src/routes/terminal-session.ts#L65).

Repair: publish Brain operation and runtime generation through the existing Convex-owned runtime view. Every terminal observes it independently of the Images page. The server rejects unsafe attachment during replacement, and returns the current machine/generation when attachment is safe. Window events may improve responsiveness but cannot be the source of truth.

### 7. Restore success and recovery do not establish a usable restored environment — source verified

Apply completes after `waitForServerBrainHealth`; it does not prove terminal capability or record an independently verified immutable image digest. Recovery is attempted only when the previous recorded image reference differs from the requested one, leaving same-image reruns outside that recovery branch. Recreating the previous saved image also cannot recover unsaved rootfs changes.

References: [health then completion](../packages/brain/src/image-apply.ts#L273), [recovery condition](../packages/brain/src/image-apply.ts#L290), [machine replacement](../packages/fly/src/plugin/runners/brain.ts#L1290).

Repair: check requested image identity, Brain service readiness, and terminal-agent capability separately. Preserve a healthy restored Brain if only its transport fails. Before destructive replacement, retain a sufficient recovery record and explicitly protect or account for unsaved filesystem changes. Test same-image reruns as well as different-image restores.

### 8. Saved images do not yet guarantee exact filesystem recovery — source verified, full restore matrix untested

Save archives a live filesystem, suppresses changed-file warnings, tolerates tar status 1, and appends the archive as a layer over a base image. No deletion/whiteout representation is generated here, so the implementation does not establish restoration of deletions from that base. Mount exclusions and persistent authentication volumes further mean an image is not a snapshot of the whole machine.

Reference: [capture and image append](../packages/brain/src/image-save.ts#L260).

Repair: define and test capture consistency, inclusions/exclusions, file deletions, permissions, symlinks, tool removal, and persistent-volume behavior. Do not infer exact snapshot safety from one successful save/restore happy path.

## Recommended destination and delivery order

Keep the existing Brain, terminal, gateway, tmux, and Convex boundaries. Strengthen their ownership instead of adding another scheduler or retry loop.

1. Make the present failure diagnosable and recoverable: preserve transport errors, correct status codes, enforce connection deadlines, and prove gateway recovery through suspension/tunnel loss.
2. Give the Brain shell one authoritative session writer, with generation fencing and subscription-local readiness.
3. Make the existing Convex runtime operation the shared restore authority; fence worker attempts, reconcile uncertain effects, and retire old terminal generations across tabs.
4. Enforce the complete image contract: exact capture semantics, pre-replacement recovery protection, correct same-image recovery, and separate service/terminal/image verification.
5. Verify the combined journey through the mounted local app and deployed candidate: cold start, ordinary reconnect, two tabs, gateway suspension/restart, shell restart, save/change/restore, same-image rerun, lost worker response, duplicate claim, interrupted final attempt, replacement failure, reload/navigation, and typed-command execution exactly once.

The complete outcome is a working and recoverable terminal after every supported lifecycle transition, with no false restore success and no stale terminal state. These phases are a delivery order for that full outcome, not a reduced scope.

## Verification performed this turn

| Layer | Result |
| --- | --- |
| Existing client regression suite | Passed: 11 tests |
| Existing gateway process/HTTP suites | Passed: 3 tests; SSH is simulated in these tests |
| New client behavior probes | Failed as expected: lost diagnosis, stale input readiness, missing readiness deadline |
| Engine two-subscriber probe | Reproduced generation regression 2 → 1 with simulated runtime/store |
| Restore-handler probes | Reproduced duplicate running claim and stranded final attempt with simulated DB |
| Typecheck/lint | Not run; no production code changed |
| Mocked browser suite | Not run |
| Live local browser | Exact reported failure observed; successful terminal recovery not verified |
| Live gateway/Brain | Direct SSH succeeded; gateway command failed with tunnel timeout; status timeout returned incorrect 401 |
| Deployed Dashboard journey | Not run |
| Destructive save/restore matrix | Not run |

The temporary client probe was removed from the active test suite after execution; its source is retained below for reproduction. Existing unrelated work was not edited. No commit, push, gateway restart, restore, or deployment was performed.

## Client reproduction source

Copy this block to `packages/kody-chat-dashboard/tests/unit/chat-plugins/terminal-startup-audit.spec.ts` and run `rtk pnpm --filter @kody-ade/kody-chat-dashboard exec vitest run tests/unit/chat-plugins/terminal-startup-audit.spec.ts`. All three assertions express the required safe behavior and failed against the audited source.

```typescript
import { describe, expect, it } from "vitest";
import { TerminalSessionClient, type TerminalClientSocket } from "../../../src/dashboard/lib/chat/plugins/terminal/terminal-session-client";

function harness() {
  const sockets: TerminalClientSocket[] = [];
  const timers: Array<() => void> = [];
  const client = new TerminalSessionClient({
    chatSessionId: "audit", transport: { type: "brain", label: "Brain" },
    activityLimit: null, getSize: () => ({ cols: 80, rows: 24 }),
    requestSession: async () => ({ webSocketUrl: "wss://test.invalid", session: {
      id: "audit", scope: { owner: "audit", repo: "test", conversationId: "audit" },
      target: { kind: "brain", runtimeId: "machine" },
    } }),
    createSocket: () => {
      const socket: TerminalClientSocket = { readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null, send() {}, close() {} };
      sockets.push(socket); return socket;
    },
    schedule: callback => { timers.push(callback); return timers.length; },
    cancelSchedule() {},
  });
  return { client, sockets, timers };
}

describe("temporary audit: expected safe terminal behavior", () => {
  it("keeps the gateway diagnosis after retry exhaustion and close", async () => {
    const h = harness(); await h.client.connect();
    for (let attempt = 0; attempt < 5; attempt++) {
      const socket = h.sockets.at(-1)!;
      socket.onmessage?.({ data: JSON.stringify({ type: "input-rejected", code: "terminal_transport_unavailable", message: "tunnel unavailable: context deadline exceeded" }) });
      socket.onclose?.();
      h.timers.shift()?.();
      await Promise.resolve();
    }
    expect(h.client.getState().error).toContain("tunnel unavailable");
  });
  it("blocks input until a replacement subscription proves ready", async () => {
    const h = harness(); await h.client.connect();
    h.sockets[0].onmessage?.({ data: JSON.stringify({ type: "state", sessionId: "audit", generation: 1, state: "ready" }) });
    h.sockets[0].onclose?.(); h.timers.shift()?.(); await Promise.resolve();
    h.sockets[1].onopen?.();
    expect(h.client.getState().connection).toBe("connecting");
    expect(h.client.sendInput("input-1", "hello")).toBe(false);
  });
  it("schedules a deadline for a socket that opens but stays silent", async () => {
    const h = harness(); await h.client.connect(); h.sockets[0].onopen?.();
    expect(h.timers.length).toBeGreaterThan(0);
  });
});
```
