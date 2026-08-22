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
  Repository Secrets pages. Deployment and real Engine rerun remain pending.
