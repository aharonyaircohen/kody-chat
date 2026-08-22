# Kody Auto-Improvement Loop

This document records how an operator uses Kody to build a separate product
while improving Kody when that real work exposes a defect or documentation gap.

## Operating contract

1. Kody implements the product request; the operator prompts, monitors, and
   independently verifies it.
2. Record the original prompt, Kody's visible action, the expected behavior,
   evidence, user impact, and likely owning boundary.
3. Fix automatically only when the defect has a correct, clean, simple, generic
   solution. Keep that fix separate from the product repository and add a
   regression test at the failing boundary.
4. Pause for approval when the fix changes product meaning, architecture,
   permissions, security, stored data, infrastructure, or another uncertain
   boundary.
5. Resume the original product run after the Kody fix. Do not treat Kody's own
   completion message as proof.

## Progress record

For every finding, append a dated entry with:

- Prompt: the request that exposed the behavior.
- Actual: what Kody visibly did.
- Expected: what it should have done.
- Classification: understanding, implementation, Dashboard/Chat, Engine,
  environment, security, operator, or uncertainty.
- Decision: automatic generic fix or approval required, with the reason.
- Change: source and documentation changed.
- Proof: regression, typecheck/lint, mocked browser, live local, and deployed
  live results, each reported separately.
- Product run: how the original work resumed and its verified outcome.

## 2026-08-22 — Software request routed to workflow creation

- Prompt: build the first usable vertical slice of a modern chat-based LMS in
  `aharonyaircohen/tdr`.
- Actual: Kody started the `create-workflow` GuidedFlow and asked for a workflow
  name and capability slug.
- Expected: treat this as software implementation work in the connected product
  repository; workflow creation applies only to an explicit Kody automation
  Workflow request.
- Classification: Kody understanding mistake caused by an unclear Chat skill
  boundary.
- Decision: automatic fix. Tightening the existing skill boundary is small,
  reversible, generic, and does not change the Workflow model.
- Change: the `create-workflow` skill now explicitly excludes software, app,
  website, and repository implementation requests; its unit contract covers the
  distinction.
- Proof: the focused Chat-defaults regression passes (34 tests); package lint
  passes with 25 pre-existing warnings. The repository verification command is
  currently blocked by an unrelated existing type error in
  `tests/unit/guided-flow-presenter.spec.ts`. Live local Chat is also blocked
  because the mounted runner is disabled, so mocked-browser and deployed-live
  checks have not run.
- Product run: the incorrect flow was cancelled and the TDR issue execution was
  started separately; final product verification remains pending.

## 2026-08-22 — Personal model credential unavailable to Engine

- Prompt: use MiniMax-M3 with High effort to build TDR after the credential was
  already stored under Personal Credentials.
- Actual: Chat could use the personal credential, but the issue-triggered Engine
  read only the TDR repository vault and failed authentication.
- Expected: Chat should prefer a repository credential and fall back to the
  signed-in user's personal credential. Engine should remain repository-only;
  `/init` should provision its selected personal model credential into that
  repository without overwriting an existing Repository Secret.
- Classification: Dashboard/Engine onboarding boundary and documentation gap.
- Decision: approved security-boundary change. Personal credentials are never
  exposed directly to an issue-triggered workflow.
- Change: shared Chat resolution, `/init` credential provisioning, both Secrets
  page explanations, and the vault documentation now describe one consistent
  precedence model.
- Proof: focused Chat and Engine regressions pass; Dashboard typecheck passes;
  both explanations are visible on the mounted local Personal Credentials and
  Repository Secrets pages. The production Dashboard `/init` route copied the
  signed-in user's `MINIMAX_API_KEY` into the TDR repository vault without
  exposing its value, and the following issue-triggered Engine run authenticated
  with MiniMax and completed successfully.
- Product run: Kody opened TDR PR #2 with the first learner-journey vertical
  slice. Independent review found that its completion message overstated the
  committed CI and proof artifacts. The operator repaired the protected CI
  file and SQLite setup boundary, repeated every gate, and merged the verified
  slice. TDR `main` CI run `32581777309` passed both verification and e2e.

## 2026-08-22 — Protected delivery file reported as committed

- Prompt: repair TDR PR #2 by adding the missing CI workflow and commit only
  artifacts that are visible in the PR.
- Actual: Kody wrote `.github/workflows/ci.yml`, but the Engine correctly
  excluded protected GitHub YAML from an ordinary `run` delivery. Kody then
  incorrectly claimed that the workflow was committed. It also left the
  generated `tsconfig.tsbuildinfo` tracked and reported a passing integration
  suite that failed from a clean checkout.
- Expected: preserve the protected-file boundary, but report every omitted file
  and fail the run instead of presenting partial delivery as complete.
- Classification: Engine delivery reporting and agent proof accuracy.
- Decision: automatic generic fix. The security boundary remains unchanged;
  only the delivery result now exposes protected omissions and turns them into
  a visible failed outcome.
- Change: Engine `commitAndPush` records omitted protected paths, and the final
  issue/PR status names those paths. The operator separately added the approved
  TDR CI workflow, removed the generated cache file, and made SQLite file
  preparation deterministic on a fresh filesystem.
- Proof: 47 focused Engine tests, full Engine unit/integration suite, typecheck,
  build, and package checks passed. Version `0.4.620` was published through npm
  Trusted Publishing with provenance. TDR clean install found zero
  vulnerabilities; all 25 tests, local Playwright, PR CI, mounted-browser
  resume, and post-merge `main` CI passed.
- Product run: PR #2 was rewritten around its real purpose, merged as
  `b7092cab568cdd6e0c7cb67f4dd3c85d1fb2c02d`, and verified on `main`.

## 2026-08-22 — Repository task URL deployed as a cached 500

- Prompt: continue operating TDR through the canonical Dashboard task URL.
- Actual: `/repo/aharonyaircohen/tdr/1` returned a cached production 500 while
  the same route worked locally in development.
- Expected: numeric task pages render on demand with repository-specific state.
- Classification: Dashboard route rendering.
- Decision: automatic generic fix. Marking the existing catch-all task page as
  request-time rendering is small, reversible, and matches its dynamic data.
- Change: the numeric task page now uses `force-dynamic`, with a regression
  contract preventing build-time rendering from returning.
- Proof: regression test and Dashboard typecheck passed; the production build
  passed; the production-built local canonical URL returned 200; deployment
  `dpl_4HfjspeBVrhLUfcDr4hTyZsRAaCG` is Ready; and the exact production TDR
  task URL visibly renders issue #1 instead of the error page.

## 2026-08-22 — Autonomous run ended with a redundant permission question

- Prompt: proceed autonomously through implementation and proof.
- Actual: Kody created and dispatched the correct TDR task, then ended by
  asking whether it should keep watching the already-active run.
- Expected: an explicit autonomous instruction is the permission to continue;
  Kody should report the current status and next automatic action without
  creating another user round trip.
- Classification: shared Chat output-policy defect.
- Decision: automatic generic fix. This only removes a contradictory question
  when the current user message explicitly requests autonomous continuation;
  ordinary conversations retain their follow-up question.
- Change: the shared output contract and both parent-agent prompt paths now
  recognize explicit autonomous, keep-working, keep-watching, and do-not-stop
  instructions. Regression coverage distinguishes an autonomous command from
  a question merely about autonomous behavior.
- Proof: the focused shared Chat output-policy suite passes all 21 tests.
- Product run: TDR issue #3 produced focused UI-polish PR #4. The operator
  repaired its browser-proof races and idempotent seed boundary, merged it,
  and confirmed green post-merge CI on `main`.

## 2026-08-22 — Engine runtime manifest falsely failed safe delivery

- Prompt: implement TDR issue #3 and deliver only the requested learner UI
  work.
- Actual: Kody safely committed and pushed the full product change, but the
  workflow ended red because definition hydration had refreshed
  `.kody-engine/definitions/manifest.json`. The protected-file reporter treated
  that Engine-owned runtime cache as omitted agent work.
- Expected: generated runtime/cache files stay outside the PR without affecting
  the result; only blocked user/model-authored protected configuration should
  fail delivery and name the omitted path.
- Classification: regression in the Engine delivery-reporting boundary.
- Decision: automatic generic fix. Runtime ownership is already explicit and
  permanently non-deliverable, so ignoring its generated churn is the simplest
  correct behavior and does not weaken the security boundary.
- Change: Engine now distinguishes generated runtime/cache paths from
  reportable protected configuration. GitHub workflow and operator-config
  omissions still fail visibly. A new packaged delivery-boundary guide explains
  both outcomes and approved allowlisted delivery.
- Proof: the regression reproduces hydrated manifest churn beside a real source
  edit; the full Engine suite passed 2,253 tests with four files skipped,
  typecheck and build passed, npm pack includes the new guide, and version
  `0.4.622` published successfully through `kody.yml` run `32583168522`.
- Product run: TDR PR #4 remained intact; its safe product files were already
  delivered, and its PR checks continued normally.

## 2026-08-22 — Review-ready PR opened without repository verification

- Prompt: extend the working TDR learner journey with a multi-course dashboard,
  independent progress, real browser proof, and green CI; proceed autonomously.
- Actual: Kody opened PR #6 and labeled it `kody:reviewing` without running the
  repository's verification commands. Three new tests failed in the first CI
  run, legacy browser selectors were stale, and six screenshots described in
  the proof document were absent from the commit.
- Expected: Kody should discover the repository's existing quality scripts,
  run them before normal PR delivery, and never rely on optimistic browser UI
  as persistence proof.
- Classification: Engine onboarding/configuration gap plus agent proof failure.
- Decision: automatic generic fix. Conventional package scripts are an
  existing repository-owned contract; discovering them when explicit quality
  configuration is absent is simple, reversible, credential-safe, and useful
  to every consumer repository.
- Change: Engine now discovers `typecheck`, `lint`, `test:unit`/`test`, and
  non-mutating format-check scripts using the repository's lockfile package
  manager. Explicit quality values, including explicit empty strings, still
  win. `kody-engine init`, the configuration schema, README, and the new
  `docs/quality-gates.md` explain the behavior and the empty-repository → later
  application setup order.
- Proof: the Engine regression covers automatic discovery and explicit
  overrides; the full Engine suite, typecheck, and build passed. The unchanged
  TDR config resolves to `npm run typecheck`, `npm run lint`, and
  `npm run test:unit`. Engine `0.4.623` published through `kody.yml` run
  `32585359819`.
- Product run: the operator corrected invalid fixtures and stale selectors,
  removed a duplicate dashboard query, made browser waits prove persisted tutor
  responses, generated and visually checked all six screenshots, and linked
  the substantive green CI run. PR #6 merged as
  `4763ab5ddd4ab1ccd672506d95215b1aac3e25d1`; post-merge `main` CI run
  `32585370840` passed verification and all six Playwright journeys. The mounted
  local dashboard also rendered the correct most-recent course and navigated
  its Resume lesson action to the persisted transcript.

## 2026-08-22 — Merged Kody work kept stale failure/review labels

- Prompt: finish verified Kody work and continue the autonomous product loop.
- Actual: merged TDR PRs #2, #4, and #6, plus their closed issues, still showed
  `kody:reviewing` or `kody:failed`. The Engine ignored closed pull-request
  events, so the visible lifecycle never reached done.
- Expected: when a Kody-owned PR is merged, both the PR and any issue closed by
  its standard `Closes`, `Fixes`, or `Resolves` reference should show
  `kody:done`.
- Classification: Engine pull-request lifecycle gap.
- Decision: automatic generic fix. GitHub's merged flag and closing references
  provide a narrow, standard boundary; unrelated PRs remain untouched.
- Change: Engine now handles merged pull-request events, recognizes only PRs
  already carrying a Kody lifecycle label, and finalizes the PR and linked
  issues as done. The new pull-request lifecycle guide documents the trigger,
  scope, and failure behavior.
- Proof: focused lifecycle tests, the full Engine suite, typecheck, build, and
  coverage gate passed. Engine `0.4.624` published successfully through
  `kody.yml` run `32585732169`. Existing stale labels on TDR issues #1, #3,
  and #5 and PRs #2, #4, and #6 were repaired to `kody:done`.
- Product run: TDR issue #7 was dispatched next to correct a newly surfaced
  persistence defect: normal development startup currently deletes learner
  progress and chat history even though the product promises restart-safe
  persistence.

## 2026-08-22 — Normal TDR startup deleted learner state

- Prompt: continue building the LMS while auditing each existing product
  promise before adding the next feature.
- Actual: TDR ran its seed from every normal `npm run dev` startup, and the
  seed deleted all messages and progress for the seeded lessons. Closing and
  restarting the app therefore erased the learner journey advertised as
  persistent.
- Expected: ordinary setup may update seeded course content but must preserve
  learner-owned state; erasure must require the explicit reset command.
- Classification: surfaced TDR product defect, not an Engine defect.
- Decision: automatic product correction. Removing unconditional learner-data
  deletion restores the existing contract without changing the schema or
  adding a new subsystem.
- Change: Kody made the course seed non-destructive, retained `npm run
  db:reset` as the explicit destructive path, added real-seed integration
  coverage, and clarified startup/reset behavior in README and proof docs.
- Proof: 49 typechecked and linted unit/integration tests passed locally,
  including two real seed-command regressions; all six Playwright journeys
  passed locally and in PR CI. PR #8 merged as
  `a0cf29684d859265ba1ed234e9bfba9f8eaed8c2`; post-merge `main` CI run
  `32586275685` passed verification and e2e.
- Product run: the newly published lifecycle handler processed the real merge
  in run `32586273078` and automatically changed issue #7 and PR #8 from
  `kody:reviewing` to `kody:done`. Issue #9 was then dispatched to repair the
  next surfaced learner blocker: an incorrect chat answer permanently poisons
  transcript replay and prevents a later correct retry from advancing.

## 2026-08-22 — Incorrect answers permanently blocked lesson progress

- Prompt: make an incorrect learner answer recoverable without introducing an
  LLM, grading system, hints subsystem, or lesson-page redesign.
- Actual: transcript replay stopped at the first unmatched learner turn. Since
  that persisted turn was always encountered first, later correct retries
  could never advance. Kody's first repair also exposed internal author text
  such as “Learner indicates they are ready” and silently skipped every kind
  of transcript mismatch.
- Expected: preserve the wrong answer, provide learner-facing retry guidance,
  allow a later correct answer to advance after refresh, and continue failing
  safely on unrelated tutor/order corruption.
- Classification: surfaced TDR product defect plus operator quality correction;
  no generic Engine defect was found.
- Decision: automatic clean correction. The existing deterministic script and
  persisted transcript remain the owners; no new system or schema was needed.
- Change: replay now skips only wrong learner turns and the exact retry feedback
  generated for their current step. Script prompts are explicitly learner-facing
  course content, while expected keywords remain internal. Arbitrary tutor
  mismatches retain the safe divergence response.
- Proof: local typecheck, lint, and 58 unit/integration tests passed, including
  wrong → retry → advance, persisted refresh recovery, and corrupted tutor
  history. All seven Playwright journeys passed. In the mounted app, the wrong
  answer `watermelon` remained visible, a natural retry prompt appeared, and
  `next` advanced after a hard refresh. PR #10 and post-merge `main` CI were
  green; PR #10 merged as `51505a218585acdf7901ee53a43f3c085250227c`.
- Product run: merge lifecycle run `32587746011` automatically finalized issue
  #9 and PR #10 as `kody:done`; post-merge CI run `32587748410` passed both
  verification and all seven browser journeys.

## 2026-08-22 — Existing sequential lesson rule was not enforced

- Prompt: make the existing `canEnterLesson` rule real across the learner UI,
  direct navigation, and lesson actions without adding a permissions system.
- Actual: every future lesson remained linked, direct URLs opened normally,
  and Next appeared before completion. Kody's first repair covered the visible
  UI and page redirect but left seed, message, and completion APIs able to
  mutate locked lessons. Its first browser check also expected `Start` while
  the untouched course incorrectly rendered `Continue`, causing red CI.
- Expected: one policy owner governs cards, pages, and mutations; an untouched
  course says Start, locked work cannot be changed through APIs, and completion
  immediately unlocks the next lesson.
- Classification: surfaced TDR product and enforcement-boundary defects; no
  generic Engine defect was found.
- Decision: automatic clean correction. The existing helper was reused at the
  service boundary, with no new authorization model, schema, or subsystem.
- Change: future lessons render Locked without links, locked URLs redirect to
  the current lesson, Next is completion-gated, and the shared service rejects
  locked seed/message/complete mutations with `409`. Course action wording now
  distinguishes untouched Start from active Continue.
- Proof: local typecheck, lint, and 69 unit/integration tests passed, including
  mutation-bypass coverage; all nine Playwright journeys passed. In the mounted
  app, lessons 2–3 were locked, direct lesson-2 navigation redirected, all three
  mutation endpoints returned `409`, and completing lesson 1 immediately
  exposed Next and unlocked lesson 2. PR #12 merged as
  `bfac10d6a5fb838f74d1a0691d9503753338b671`.
- Product run: lifecycle run `32588635911` automatically finalized issue #11
  and PR #12 as `kody:done`; post-merge CI run `32588638458` passed verification
  and all nine browser journeys.

## 2026-08-22 — Documentation overstated learner ownership

- Prompt: audit the next product boundary before adding multi-user accounts or
  course authoring.
- Actual: TDR documentation described both `Message` and `Progress` as
  learner-owned, but only `Progress` has a `learnerId`; transcript queries key
  messages by lesson alone.
- Expected: documentation must state the current single-learner boundary and
  warn that accounts are unsafe until transcripts gain learner ownership.
- Classification: surfaced TDR documentation defect and an important pending
  product data-ownership decision; no generic Engine defect was found.
- Decision: automatic documentation correction only. Changing schema, stored
  records, or query ownership requires approval, so Kody was explicitly kept
  out of runtime code.
- Change: README and architecture docs now state that
  `CURRENT_LEARNER_ID` scopes progress only, while seed/read/replay message
  queries remain lesson-global. Proof and seed comments no longer call messages
  learner-owned.
- Proof: the PR changed only four documentation/comment files. Local typecheck,
  lint, and all 69 unit/integration tests passed; PR CI and post-merge CI run
  `32589123023` passed verification and all nine Playwright journeys. No mounted
  local or deployed UI check was needed because runtime behavior did not change.
- Product run: PR #14 merged as
  `273d87d79aa9ecc1300d178da6f1b6114f335283`; lifecycle run `32589123068`
  closed issue #13 and finalized both issue and PR as `kody:done`. Multi-user
  work remains gated on approval for learner-owned message migration.

## 2026-08-22 — Final tutor reply disappeared after refresh

- Prompt: continue auditing the safe single-learner journey while the
  learner-owned message migration remains approval-gated.
- Actual: `sendTurn` returned the final tutor reply with a fabricated
  `terminal-*` id instead of saving it. The learner saw the closing line once,
  but refresh removed it; direct API calls could also append turns after
  completion.
- Expected: the closing tutor line is a normal persisted message, and a
  completed transcript is read-only through both UI and API.
- Classification: surfaced TDR persistence and mutation-boundary defect; no
  generic Engine defect was found.
- Decision: automatic clean correction. It restores the existing persistence
  promise using the current service and API boundaries, with no schema,
  ownership, authentication, or navigation change.
- Change: Kody persisted every tutor reply and added a completed-lesson conflict
  at the shared service boundary, mapped to HTTP `409`. The operator removed
  duplicated proof and corrected Kody's browser test, which had hard-coded the
  wrong number of scripted tutor turns.
- Proof: local typecheck, lint, and 71 unit/integration tests passed. The first
  browser run exposed the incorrect Kody assertion; the corrected suite passed
  all ten Playwright journeys on isolated port 3019. PR CI and latest
  post-merge `main` CI run `32589953857` passed verification and all ten
  browser journeys.
- Product run: PR #16 merged as
  `57b955a3ee644463121d590e5db4247359d83d11`; lifecycle run `32589952311`
  closed issue #15 and finalized both issue and PR as `kody:done`.

## 2026-08-22 — Continue ignored later activity in an existing course

- Prompt: continue auditing the safe single-learner journey while the
  learner-owned message migration remains approval-gated.
- Actual: the dashboard chose Continue from `Progress.updatedAt`, but
  `sendTurn` did not update an existing unfinished progress row. After activity
  in A, then B, then A again, Continue could remain on B.
- Expected: every successful chat turn refreshes the current learner's course
  activity; rejected turns do not change it.
- Classification: surfaced TDR activity-tracking defect plus Kody proof-quality
  mistakes; no generic Engine defect was found.
- Decision: automatic clean correction. It reuses the existing progress
  timestamp and transaction with no schema, UI, or ownership change.
- Change: Kody updates an existing unfinished `Progress.updatedAt` after a
  successful turn. The operator replaced duplicated fixtures, corrected a
  rejection test that inspected the wrong course, and fixed the browser proof
  to wait for the persisted tutor response rather than an optimistic learner
  bubble.
- Proof: local typecheck, lint, and 73 unit/integration tests passed. The first
  browser run exposed the optimistic-response race; the corrected suite passed
  all 11 Playwright journeys. PR CI and latest post-merge `main` CI run
  `32590821527` passed verification and all 11 journeys.
- Product run: PR #18 merged as
  `dba5af52491c372126a6ae6edf4f37833c42f633`; lifecycle run `32590820105`
  closed issue #17 and finalized both issue and PR as `kody:done`.

## 2026-08-22 — Cumulative proof became stale and overstated behavior

- Prompt: keep improving documentation while auditing the safe current product
  boundary.
- Actual: the proof index still called merged issues #9 and #11 “this PR,”
  omitted issues #15 and #17, and README contained duplicate journey numbering.
  Kody's first correction then invented re-seeding behavior, the wrong `409`
  response meaning, and inaccurate regression counts.
- Expected: cumulative proof names real merged PRs, cites existing CI runs, and
  describes only behavior and tests confirmed by source and run evidence.
- Classification: TDR documentation gap plus Kody proof-accuracy mistake; no
  generic Engine defect was found.
- Decision: automatic documentation correction. It changes no runtime,
  architecture, storage, permissions, or product meaning.
- Change: README numbering is sequential; the proof index names PRs #10, #12,
  #16, and #18; concise sections for completed-transcript stability and A → B →
  A activity cite their real post-merge runs. The operator removed invented
  behavior and corrected API and test descriptions.
- Proof: only `README.md` and `docs/proof.md` changed. Local typecheck, lint, and
  73 tests passed; PR CI and latest post-merge `main` CI run `32591265688`
  passed verification and all 11 Playwright journeys. No mounted or deployed UI
  check was needed because runtime behavior did not change.
- Product run: PR #20 merged as
  `058be8bab76b66d97ef5d986d0a794e6a4d81d1f`; lifecycle run `32591264544`
  closed issue #19 and finalized both issue and PR as `kody:done`.
