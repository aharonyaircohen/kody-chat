# Kody Chat Package Release Plan

## Outcome

An external project can install `@kody-ade/kody-chat`, connect it to its own
system, and render a working chat without importing Dashboard code or copying
Kody internals.

This plan follows the
[Kody Chat Extraction Plan](kody-chat-extraction-plan.md). It productizes the
independent package; it does not replace or bypass the extraction.

## Entry Criteria

Release work begins only when:

- Production code in Kody Chat has no `@dashboard/*` imports.
- Dashboard-specific routes, tools, agents, storage, and navigation are owned
  by Dashboard.
- The package builds outside the monorepo.
- A packed tarball installs in a clean external-consumer fixture.
- The extraction verification and protected Dashboard journeys pass.
- The mandatory no-skip live UI matrix passes.
- The public package manifest has valid `scripts`, `exports`, dependencies,
  peer dependencies, and included files.

The external-consumer fixture may be created earlier as an extraction test.
That does not mean the package API is stable or ready for release.

## Supported Use

The first supported use is a React host that supplies its own system
connections:

```tsx
<KodyChat host={host} />
```

The exact API must be validated in the external-consumer fixture before it is
declared stable. The intended host responsibilities are:

- Identity and request authentication
- Chat transport
- Conversation and attachment persistence
- Active application context
- Navigation requests
- Client-side contributions
- Optional telemetry

Server-side tools, model credentials, authorization, and secret access must
remain on the server. The browser host API must never receive privileged tool
implementations or provider secrets.

## Public Package Shape

Prefer one package with small documented subpath exports. Do not create more
packages unless a real consumer proves they are necessary.

Proposed public areas:

```text
@kody-ade/kody-chat
@kody-ade/kody-chat/react
@kody-ade/kody-chat/core
@kody-ade/kody-chat/plugins
@kody-ade/kody-chat/next
@kody-ade/kody-chat/styles.css
```

The root or React export should provide:

- `KodyChat`
- `KodyChatProvider`, only if shared host state requires it
- Host configuration types
- Theme and display configuration
- Public event callbacks

The core export should provide:

- Message and conversation contracts
- Attachment references
- Transport contracts
- Stream event contracts
- Plugin contracts

The optional Next.js export should provide small route-handler factories only
where framework-specific help materially reduces integration work. It must not
ship Kody Dashboard routes or assume `/api/kody/*`.

Internal reducers, Dashboard adapters, product prompts, tool implementations,
and storage implementations are not public exports.

## Phase 1: Validate the Consumer Contract

Start with one concrete external project or representative fixture.

1. Write the smallest expected installation example.
2. List the context and system actions that project needs to expose to chat.
3. Define the minimum host interface from those real needs.
4. Confirm which backend the external project uses.
5. Confirm whether it needs a remote Kody service, its own model route, or an
   optional Next.js adapter.
6. Reject package API fields that exist only to mirror Dashboard internals.

Exit criteria:

- A small consumer example expresses the full required integration.
- Client and server responsibilities are explicit.
- No public contract is justified only by the existing Dashboard shape.

## Phase 2: Stabilize the Public API

1. Export only documented entry points.
2. Add compile-time consumer tests for every public example.
3. Add contract tests for host callbacks, transport events, errors, and
   cancellation.
4. Define stable defaults for optional behavior.
5. Define typed error outcomes for authentication, transport, storage, and
   plugin failures.
6. Mark all other modules private.

Compatibility rules:

- Public types cannot import Dashboard types.
- Public types cannot expose Kody repository concepts unless the feature is an
  optional Kody integration supplied by the host.
- Existing message and event data must remain forward-compatible where
  practical.
- Unknown event and plugin fields must not crash older consumers.

Exit criteria:

- Public examples compile against the packed artifact.
- Consumers import no internal paths.
- The package export test rejects undocumented paths.

## Phase 3: Produce a Real Library Artifact

The release artifact should contain compiled JavaScript, declarations, and
required styles rather than requiring consumers to compile arbitrary monorepo
source.

1. Produce ESM output and TypeScript declarations.
2. Declare React and React DOM as compatible peer dependencies.
3. Keep Next.js isolated to the optional adapter boundary.
4. Remove `workspace:*` references from the published manifest.
5. Confirm every runtime dependency is public and intentionally required.
6. Exclude tests, internal docs, secrets, fixtures, and application routes from
   the tarball.
7. Verify browser exports do not load Node-only modules.
8. Verify server exports do not enter the client bundle.

Exit criteria:

- A clean project installs the tarball without monorepo configuration.
- No Dashboard aliases, workspace paths, or unpublished private dependencies
  are required.
- The consumer production build succeeds.

## Phase 4: Complete the External Integration

The consumer should implement:

1. Identity and authentication adapter
2. Chat transport adapter
3. Conversation and attachment storage adapter
4. Context provider
5. Navigation handler
6. Optional client plugin contributions
7. Server-side model and tool integration

Required proof:

- Mount and unmount cleanly
- Send and cancel a turn
- Stream an assistant reply
- Handle transport failure and recovery
- Persist and restore a conversation
- Send an attachment when enabled
- Dispatch a host navigation or context effect
- Reject unauthorized server actions
- Render correctly on desktop and mobile

Exit criteria:

- The real external project completes its intended chat journey.
- No consumer patch reaches into package internals.

## Phase 5: Documentation and Developer Experience

Documentation must include:

- Installation
- Supported React and framework versions
- Minimal client setup
- Server setup
- Host interface reference
- Authentication example
- Storage example
- Transport example
- Plugin example
- Styling and theming
- Error handling and cancellation
- Security boundary
- Upgrade and compatibility policy
- Troubleshooting

Examples must be tested code, not illustrative snippets that drift from the
package.

Exit criteria:

- A new consumer can integrate from the documentation alone.
- Every documented import is covered by a compile or runtime test.

## Phase 6: Release Readiness

Before publishing:

1. Determine the release version from current registry and repository state.
2. Record whether earlier published versions are supported, deprecated, or
   superseded.
3. Add or document the real npm publication workflow.
4. Verify package provenance, license, repository metadata, and included files.
5. Review the public API for accidental internal exposure.
6. Run dependency and secret checks against the packed artifact.
7. Generate release notes describing the supported host contract.

No npm publication workflow is currently defined in this repository. The
release process must be added and verified before claiming the package is
published.

Exit criteria:

- Version and compatibility decisions are explicit.
- Publication credentials and automation are verified without exposing
  secrets.
- The exact tarball approved by verification is the tarball being published.

## Phase 7: Pilot Release

1. Publish a clearly identified prerelease.
2. Install the registry version in the external project; do not use a workspace
   link or local tarball for final pilot proof.
3. Run the complete external integration journey.
4. Run the complete Dashboard regression gates against the same package
   version.
5. Record bundle impact, runtime errors, and integration friction.
6. Fix contract problems before stable release.

Exit criteria:

- Dashboard and the external project consume the same published version.
- Both pass their required browser journeys.
- No compatibility alias or unpublished dependency is required.

## Phase 8: Stable Release and Adoption

1. Publish the approved stable version.
2. Pin or range the dependency according to the compatibility policy.
3. Verify the registry package metadata and install it from a clean cache.
4. Deploy Dashboard and the external consumer.
5. Run live smoke tests against both deployments.
6. Publish migration notes for future upgrades.

Publication, installation, deployment, and live proof are separate completion
facts and must be reported separately.

## Verification Gates

Every release candidate must pass:

```bash
pnpm verify
pnpm --filter kody-dashboard test:e2e:gate
```

It must also pass:

- Affected targeted Dashboard journeys
- Package unit and integration tests
- Packed-artifact export tests
- Clean external install
- External consumer typecheck and production build
- External consumer browser journey
- Full live local UI matrix with zero skips
- Registry-install pilot journey
- Deployed live UI journeys through real APIs and persistence

Environment-gated live checks must be reported as unverified when they cannot
run, and the release remains incomplete. A page-load smoke is not a substitute
for a live user journey.

## Versioning Policy

Use semantic versioning for the supported public contract:

- Patch: compatible fixes with no public contract change
- Minor: backward-compatible capabilities or optional fields
- Major: removed exports, incompatible host contracts, changed required
  behavior, or incompatible event formats

Before the first stable version, prerelease notes must still identify breaking
changes. A `0.x` version is not permission to change the integration contract
silently.

## Release Completion Report

```text
Package version:
Public API review:
Typecheck:
Lint:
Unit tests:
Integration tests:
Dashboard browser gate:
Targeted Dashboard journeys:
Packed artifact:
Clean external install:
External production build:
External browser journey:
Live local UI matrix:
Live UI skipped:
Live UI artifacts:
Registry publication:
Registry-install proof:
Dashboard deployment:
External deployment:
Deployed live UI matrix:
Known unsupported hosts:
Known unverified areas:
```

## Definition of Done

The package release is complete only when:

- An external project installs Kody Chat from the registry.
- The integration uses only documented public APIs.
- The host controls identity, transport, storage, context, navigation, and
  product integrations.
- Privileged tools and secrets remain server-side.
- The package artifact is compiled, typed, scoped, and independently usable.
- Dashboard and the external project consume the same verified release.
- Documentation examples are tested.
- Publication, deployment, and live behavior are all independently proven.
