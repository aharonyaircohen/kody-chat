# Kody Desk implementation plan

Date: 2026-09-26
Status: local implementation in progress in `/Users/yac/projects/kody-desk`.

## 1. Outcome

Build a personal, single-user web app in a new repository named `kody-desk`.
Preserve the current Kody user experience: the side panel, the chat rail,
chat expansion and restoration, and the main content window. The main window
starts empty. Hermes supplies agent execution and conversation persistence.
Its existing dashboard supplies administration.

The first useful release must support everyday conversation, model selection,
supported reasoning effort, image attachments, tool progress, approvals, stop,
and reopening a conversation. A deliberately incomplete chat is not the goal.

Success means the user can do normal Hermes work through the familiar Kody
interface without running the Kody backend or maintaining another agent engine.

## 2. Scope boundaries

### Included

- Existing Kody visual design, spacing, typography, themes, and responsive behavior.
- Existing sidebar collapse/expand and chat resize/expand/restore interactions.
- Conversation list, new conversation, history, and session switching.
- Streamed assistant responses and supported tool progress.
- Model/provider selection and supported effort controls in the existing setup UI.
- Image selection, paste/drop where the original composer supports it, preview,
  removal before sending, and transmission through a verified Hermes endpoint.
- Approval controls supported by the installed Hermes API.
- Explicit stop, error handling, and recovery after a page refresh or disconnect.
- An external link to Hermes Admin.
- A small server adapter and access protection suitable for personal hosting.

### Deferred

- Eve integration, agent builders, and custom execution infrastructure.
- Kody Engine, Brain, Convex, Agency, GitHub login, repository selection,
  notifications, Store, CMS, file manager, previews, and task-management pages.
- Rebuilding Hermes administration, model credential management, memory editors,
  skills management, MCP setup, or scheduling screens.
- Voice, general document uploads, multi-user accounts, organizations, and billing.
- Hostinger purchase or deployment before the local acceptance gate passes.

Keep useful Kody implementations available in the original repository. Nothing
in this plan authorizes deleting or migrating its data or retiring its services.

## 3. Evidence and open questions

Inspected Kody base commit: `f4ce3d8ca`. The worktree contains unrelated committed
and uncommitted source; the current UI reference must include a recorded snapshot
of the relevant working files, not just that commit.

Observed locally:

- Hermes CLI: `2026.9.24`, upstream `d0288be5`, installed under
  `/Users/yac/.hermes/hermes-agent`.
- Hermes dashboard returned HTTP 200 at `http://127.0.0.1:9119/`.
- Nothing answered the API health request at the default port `8642`. This does
  not establish whether the API is disabled or configured on another port.
- Installed source contains session, model-options, run, streaming, approval,
  and stop routes, plus reasoning option translation. These have not been
  exercised through the live API in this inspection.
- The public chat package supplies a clean structural frame, but its default
  chat is not the full dashboard UX requested here.
- The dashboard shell and chat surfaces import legacy services and plugins.
  Importing the full private integration package is not a clean shortcut.

Questions to resolve with live evidence in phase 0:

- How do we create, reopen, and stream an existing session while retaining its ID?
- Which model options and effort values are supported, and what overrides take
  precedence over the selection sent by the UI?
- Can image-bearing requests use the same session/run lifecycle as text?
- Which pending approval/input events are exposed and how are they answered?
- How are active runs found after refresh, and what history is available after
  event buffers or run-status records expire?
- What retry/idempotency and event replay guarantees does this installed version
  actually provide?

Do not assume current online documentation exactly matches the installed build.
Use its capabilities endpoint, source, and small live tests together.

## 4. Ownership and architecture

```text
Browser: Kody Desk UI
          |
Next.js: authenticated, narrow API adapter
          |
Hermes: sessions, agent execution, tools, model access, history

Hermes Admin: separate existing dashboard for configuration
```

Use Next.js with TypeScript because the source UI already uses Next.js and the
intended host is Vercel. Select compatible dependency versions during extraction;
do not combine this work with a framework upgrade. Use the current Kody styling
and necessary UI primitives without importing its private backend packages.

| Responsibility | Owner |
| --- | --- |
| Layout, composer, displayed messages and controls | Kody Desk |
| Authentication and private API credentials | Kody Desk server |
| Request/event translation | Small Hermes adapter |
| Conversation transcript and execution state | Hermes |
| Model calls, tools, memory, compaction | Hermes |
| Provider keys, integrations, administration | Hermes Admin |
| Sidebar width, theme, temporary draft, last selected IDs | Browser preferences |

No application database is planned. Browser storage may keep identifiers and
preferences, but must not become an authoritative transcript or execution store.
If reliable recovery requires another database, stop and review that requirement
instead of silently introducing one.

Use one Hermes integration, with no speculative runtime abstraction or plugin
framework. The server may forward only required routes to a configured upstream;
it must not accept an arbitrary destination URL from the browser.

## 5. Exact UX reuse

Reference: current Kody dashboard shell in both normal rail and expanded `/chat`
states. This is extraction of the existing shell, not design of a new page type.
The intentional differences are the Kody Desk name, empty main pane, Hermes Admin
link, and removal of controls for excluded features.

Primary source components:

- `packages/kody-chat-dashboard/src/dashboard/lib/components/ChatShell.tsx`
- `packages/kody-chat-dashboard/src/dashboard/lib/components/Sidebar.tsx`
- `packages/kody-chat-dashboard/src/dashboard/lib/chat/surface/HeaderControls.tsx`
- `packages/kody-chat-dashboard/src/dashboard/lib/chat/surface/ChatSetupControl.tsx`
- `packages/kody-chat-dashboard/src/dashboard/lib/chat/surface/Composer.tsx`
- Message and session surfaces reached from the same chat surface directory.
- `packages/kody-chat/src/frame.tsx`
- `apps/dashboard/src/dashboard/globals.css` and the required theme/UI primitives.

Extract the relevant source into the new repo with provenance and applicable
license notices. Preserve markup, classes, and interactions where practical;
replace service hooks with explicit props and the Hermes adapter. Do not copy
the large `KodyChat` controller or `ChatRailShell` host wholesale.

Capture reference screenshots and interaction checks before extraction: sidebar
open/closed, chat rail/expanded/restored, resized rail, composer, model/effort menu,
conversation list, both themes, and narrow screens. Compare the new app against
these references rather than relying on memory.

The empty main pane gets no speculative welcome dashboard, cards, or placeholder
features. Sidebar navigation offers only implemented destinations. Preserve its
appearance, without dead links to removed Kody features.

## 6. Implementation phases

### Phase 0 — Verify the connection and freeze the reference

1. Record current source revisions and relevant uncommitted UI differences.
2. Capture the real mounted Kody UI reference states. If the source app cannot
   run, mark exact visual matching as blocked; source inspection is insufficient.
3. Locate the local Hermes API configuration without printing secret values.
4. Enable/start only the needed API if necessary, preserving existing profiles
   and credentials. Record configuration changes and how to undo them. Avoid
   starting unrelated messaging or scheduled services without checking effects.
5. Read capabilities and exercise a disposable session: text, model/effort,
   image, stop, and any required approval/input lifecycle.
6. Check session history and refresh recovery, including error responses.

Exit: a short verified contract and a feature support table. Unsupported essential
features trigger a scope decision before UI implementation. No upstream patching.

### Phase 1 — Create Kody Desk and reproduce the shell

1. Create `/Users/yac/projects/kody-desk` as an independent Git repository.
2. Add minimal app configuration, ignore rules, environment example, README,
   and concise project instructions reflecting this scope.
3. Extract styling, sidebar, chat shell, frame, and the required UI primitives.
4. Reproduce resizing, expansion/restoration, sidebar behavior, themes, and mobile
   layout with an empty main window. Keep one logical conversation state across
   layout changes; avoid duplicate requests from multiple chat mounts.
5. Include the Hermes Admin link as a normal external link. Do not embed or proxy
   its full administration interface.
6. Add browser regression checks for the retained layout interactions and compare
   reference screenshots at matching viewport sizes.

Exit: independently running app with the agreed Kody appearance and no requests
to the legacy Kody backend. The shell can be reviewed before runtime work expands.

### Phase 2 — Connect complete basic conversation behavior

1. Implement a small server-only Hermes client with fixed upstream configuration.
2. Connect session list/create/load and the verified send/stream lifecycle.
3. Translate text, tool progress, completion, and failure into presentation state.
4. Implement explicit stop and supported approvals/input requests.
5. Keep the run/session identity early enough to recover after refresh. Prefer
   Hermes session/run discovery; browser hints must be reconciled with Hermes.
6. Separate a disconnected display from cancelled execution. Reconnect or query
   status/history instead of automatically resubmitting work.
7. Use supported idempotency for start retries. If acceptance is uncertain and
   cannot be looked up, show that uncertainty and require an explicit new start.

Exit: real local conversations work, reopen, stop, and recover through the mounted
app. The legacy runtime is not involved.

### Phase 3 — Complete the everyday composer

1. Populate model choices from Hermes. Display the effective selected model and
   handle existing session overrides so selection is never silently misleading.
2. Connect supported reasoning effort values. Hide/disable effort when the model
   does not support it; do not invent a universal list.
3. Add supported image attachments using the original composer interactions.
   Verify images reach the model, survive history reload as supported, and fail
   clearly when format, size, or model capability is incompatible.
4. Keep provider credentials and global defaults in Hermes Admin. No parallel
   provider configuration screen in Kody Desk.
5. Complete pending, failed, retryable, and offline states without automatic
   duplicate agent runs.

Exit: the agreed front-chat experience works through the real local Hermes API.
Document any remaining API gaps before treating the local release as complete.

### Phase 4 — Local usefulness checkpoint

Use the app on representative daily work: a conversation continued later, a task
with tools, an image request, and a longer task with stop/approval/reconnect.

Fix defects in agreed behavior. Record additional feature requests separately;
do not add them automatically. Decide whether this version is useful enough to
keep using before considering hosting or Eve.

Exit: user review of the useful workflow and exact UX, with a short list of proven
behavior, remaining limitations, and proposed next work.

### Phase 5 — Hosting, only after local acceptance

1. Confirm the chosen Hostinger image exposes the verified Hermes API version.
2. Configure persistent Hermes storage, authenticated HTTPS, and backups.
3. Deploy Kody Desk to Vercel with server-only upstream credentials and a tested
   single-user access mechanism. Protect every proxy route, including streaming.
4. Keep Hermes Admin separately protected and follow its deployment guidance.
5. Test platform payload limits for image requests and duration limits for streams.
   Agent execution stays on Hermes when a Vercel request ends. Recover through
   the existing session/run API; never restart the task just to restore the UI.
6. Run the same live journeys against the deployed candidate before calling
   hosting complete. Test the release artifact, not just the development server.

Hosting is a later milestone, not a prerequisite for the local experiment.

## 7. Verification and completion

Each behavior change gets automated regression coverage at its boundary.
Use deterministic browser tests for UI states and separate real mounted-app
journeys for Hermes integration. A mocked model or intercepted Hermes request
does not establish real integration success.

Required journeys:

- Sidebar collapse/expand, chat resize/expand/restore, and blank main pane.
- Session create, switch, reload, and history retrieval.
- Streamed response and tool progress, including a tool failure.
- Model change and effective effort behavior.
- Image add/remove/send and supported history behavior.
- Approval allow/deny and any supported request for user input.
- Stop while running and reconciliation with final execution state.
- Refresh mid-run, dropped stream, unavailable Hermes, and ambiguous start.
- Credentials absent from client bundles, responses, and routine logs.
- Hosted unauthorized access rejected for every app API route.

Every phase report lists separately:

| Check | Required reporting |
| --- | --- |
| Automated regression tests | Passed / failed / not run, with scope |
| Typecheck and lint | Separate results |
| Production build | Passed / failed / not run |
| Mocked browser tests | Explicitly identified as mocked |
| Live local app tests | Real Hermes and persistence |
| Deployed live tests | Not run until hosting; required for hosted completion |

Missing live checks leave the affected feature unverified. Preserve screenshots
and concise test artifacts. Do not label local acceptance as deployed acceptance.

## 8. Preventing scope growth

- Work one phase at a time and keep a runnable revision at each milestone.
- Set a time budget for the first useful workflow before implementation; the
  user has not selected a budget yet. Report actual effort at checkpoints.
- Before a new subsystem, ask whether the verified requirement can be met by an
  existing Hermes interface or a retained presentation component.
- Reassess if progress requires upstream Hermes changes, another durable task
  store, a general runtime abstraction, or importing the whole Kody backend.
- Keep the original repos intact. Preserve provenance for extracted files and
  account explicitly for dirty worktrees before any commit or handoff.
- Do not install every legacy dependency to make copied imports compile.
- Defer Eve until a specific useful workflow cannot be handled adequately by
  Hermes and delegation offers a clear benefit.

## 9. Current checkpoint

Completed: source inspection, local Hermes version check, dashboard HTTP check,
this plan, independent repository creation, local API startup, and a running
Kody Desk UI. A real Hermes text reply streamed into the mounted app and
survived refresh. Browser checks cover shell controls, session creation and
reopen, image request formatting, model/effort request formatting, approvals,
and stop. The local app also passed unit tests, typecheck, lint, and build.

Open: the existing Kody `/chat` route did not render an authenticated reference
for a visual comparison. The Kody Desk shell follows inspected source and local
screenshots, but exact pixel fidelity has not been established. The local
Hermes model did not complete an image-aware response in the acceptance probe;
image delivery is verified only through a mocked browser request contract.
Approval and stop have mocked browser coverage, not a live agent approval/stop
journey. Deployed tests have not run.

Kody MCP is unavailable in this session. No Memory/Todo checkpoint was saved.
The plan is a repository artifact, not a replacement memory service.

Next action: finish image/provider acceptance and compare against an
authenticated mounted Kody UI reference when available. Then decide whether
the local app is useful enough to host.
