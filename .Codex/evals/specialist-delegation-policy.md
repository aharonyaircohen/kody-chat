# EVAL: Specialist delegation policy

## Goal

Kody remains the response owner. It delegates only when specialist work is expected to improve the answer enough to justify extra time and cost.

## Decisions

- `direct`: Kody answers or performs the parent-owned action.
- `consult`: one specialist supplies focused evidence; Kody answers.
- `parallel`: two or more specialists handle independent, genuinely multi-domain work; Kody synthesizes.

## Scenario matrix

| Scenario                   | Prompt                                                                     | Expected | Reason                                                                                |
| -------------------------- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Visible page identity      | What page am I viewing?                                                    | direct   | Current page evidence already answers it.                                             |
| Visible page summary       | Summarize what is visible on this page.                                    | direct   | Current page evidence is sufficient.                                                  |
| Current selection          | What element did I select?                                                 | direct   | Current selection evidence is sufficient.                                             |
| Reference lookup           | Where is the repository settings page?                                     | direct   | Parent navigation knowledge is sufficient.                                            |
| Plain explanation          | Explain what a repository is in two sentences.                             | direct   | No specialist evidence is needed.                                                     |
| Parent tool action         | Create a new Agent for local workflow checks.                              | direct   | Kody owns Agent lifecycle tools.                                                      |
| Explicit Capability        | Run the draft-facebook-personal-post Capability.                           | direct   | Kody owns direct Capability execution.                                                |
| Focused code investigation | Find why preview history loses the selected URL.                           | consult  | One repository specialist can gather focused evidence.                                |
| Focused UI review          | Review this page for accessibility problems.                               | consult  | One experience specialist adds domain evidence.                                       |
| Operational investigation  | Investigate why the latest CI run failed.                                  | consult  | One operations specialist owns the evidence.                                          |
| Cross-domain review        | Review the preview implementation for UX, security, and operational risks. | parallel | Independent domains justify parallel work.                                            |
| Complete assessment        | Run a complete project assessment.                                         | direct   | Kody must first collect required context; later submitted tracks may run in parallel. |

## Required measurements

For every scenario, record:

- correct decision;
- number of specialists;
- time to first visible response;
- total response time;
- model calls and estimated token cost;
- answer correctness;
- whether Kody remained the visible response owner.

## Reliability gates

- Deterministic ownership rules: `pass^3 = 100%`.
- Model-based routing decisions: at least `90%` correct over three runs per scenario.
- Direct scenarios: zero specialist calls.
- Consult scenarios: exactly one specialist unless a recorded reason justifies more.
- Parallel scenarios: each assignment must represent independent work.
- No candidate replaces the current router unless correctness is no worse and median latency/cost improve.

## Confirmed baseline evidence

- On the local canonical Views route, `What page am I viewing?` delegated to three specialists.
- The final answer correctly identified the IANA Example Domains page.
- Total observed time was approximately 145 seconds.
- Current `shouldRoutePublicAgentChat` sends most non-trivial messages into a second routing stage and relies on accumulated phrase exceptions to bypass it.

## Evaluation phases

1. Run the current router against this matrix and save the baseline.
2. Define a candidate policy without replacing current behavior.
3. Run both policies over the same prompts and agent roster three times.
4. Review disagreements and failure evidence.
5. Only then implement the winning policy behind a reversible switch.

## Candidate 1: parent-owned delegation tool — rejected

Replace the separate pre-response router with one parent-owned delegation action:

1. Kody receives the user's request and all current context once.
2. Kody either answers directly or requests focused specialist work.
3. A delegation request names one or more independent assignments and explains why each is needed.
4. The runtime enforces assignment count, ownership, time, and cost limits.
5. Specialist findings return to the same Kody turn as evidence.
6. Kody remains responsible for the final answer and parent-owned actions.

This candidate removed the two competing ownership decisions and exposed specialists as an optional Kody tool. It did not add page-specific phrases or another routing prompt.

### Live local result

| Run                | Correct page | Specialists | Other tools |                    Server time | Result                                      |
| ------------------ | ------------ | ----------: | ----------: | -----------------------------: | ------------------------------------------- |
| Current router     | Yes          |           3 |           — | about 145s observed end to end | Correct but too slow                        |
| Candidate 1, run 1 | No           |           0 |           3 |                          26.7s | Incorrectly answered the generic Views page |
| Candidate 1, run 2 | No           |           0 |           0 |                          10.5s | Incorrectly answered the generic Views page |

Candidate 1 failed correctness twice and must not replace the current router. Its inactive implementation was removed after the comparison; only this evidence and the reusable evaluation matrix remain.

### What the failure proves

Removing the router alone is insufficient. The parent model's very large prompt and tool set can overlook current page evidence even when no specialist is involved. The next candidate must make one explicit ownership decision using the full current context, then give the selected owner only the tools and evidence needed for that decision. It must not rely on accumulated phrase exceptions.

## Initial deterministic comparison

The current outer gateway matched the desired first-stage decision in 5 of 12 scenarios.

- Over-routed: visible page identity, visible page summary, current selection, Agent creation, explicit Capability execution, and complete assessment intake.
- Under-routed: a focused code investigation containing the word `URL` was mistaken for a simple reference lookup.
- Correct at the gateway: repository settings lookup, bounded plain explanation, focused accessibility review, focused CI investigation, and cross-domain review.

Some over-routed parent-owned actions are corrected later by a second routing layer, but they still pay avoidable routing overhead. The IANA live test confirmed that a simple context-grounded question can pass both layers and launch three specialists.

## Candidate 2: single turn planner — built, activation not yet accepted

One bounded planner sees the current request, current page/preview context, recent conversation, and configured specialist roster. It selects exactly one owner:

- `direct + answer-only`: Kody answers from supplied context with only the final-answer tool;
- `direct + parent`: Kody keeps its normal tools for parent-owned work;
- `specialist`: the existing specialist runtime executes only the focused assignments, then Kody owns presentation.

Invalid plans, unavailable models, and unknown specialists fail safely to Kody with parent tools. The existing router remains the default unless `KODY_SINGLE_DELEGATION_PLANNER=1` is explicitly enabled.

### Live local page-identity result

| Run                                                 | Correct page evidence            | Specialists |                        Parent tools | Observed result                                                             |
| --------------------------------------------------- | -------------------------------- | ----------: | ----------------------------------: | --------------------------------------------------------------------------- |
| First candidate run, before shared context priority | No                               |           0 |                   final answer only | Planner chose correctly, but final model described the dashboard container. |
| Passing run 1                                       | Yes, IANA first                  |           0 |                   final answer only | Correct.                                                                    |
| Passing run 2                                       | Yes, IANA                        |           0 |                   final answer only | Correct.                                                                    |
| Passing run 3                                       | Yes, IANA plus container context |           0 | full parent set after safe fallback | Correct, but the planner hit its 10-second timeout.                         |

The failed first run exposed a separate context-ownership conflict: both the dashboard container and embedded preview were supplied, but the prompt did not define which one represented what the user sees. The shared system prompt now states that the preview reference is authoritative for visible page/content/selection questions. This applies equally to planning and final answering and does not add phrase-based routing exceptions.

All three post-fix runs were answer-correct and launched zero specialists. However, the planner itself completed only two of three runs; the third used the safe parent fallback and therefore missed the 90% model-routing reliability gate. Candidate 2 remains implemented behind the inactive switch and must not replace the current router until the full scenario matrix passes.

### Stabilization follow-up

- Automatic now supports a planner-only per-candidate deadline: a slow configured model is aborted after four seconds and the next configured Automatic model is tried.
- If the full planning deadline still expires, the candidate returns `fallback` and the established router owns that turn. It does not guess `direct` and does not bypass specialist routing.
- The 36-decision live evaluation harness is saved at `run-public-agent-planner-live.ts` and treats planner failures as failures.
- A MiniMax evaluation was discarded because the configured account had exhausted its token plan; all outputs were fallbacks, not decisions.
- An OpenRouter Free evaluation was stopped after repeated full-deadline failures. The available free provider could not satisfy the 90% reliability gate, so the candidate remains inactive.

### MiniMax M3 full matrix result

After the repository MiniMax credential was refreshed, Candidate 2 completed
the full 12-scenario matrix three times with `MiniMax-M3`.

- Score: **26/36 (72.2%)** — below the 90% activation gate.
- Stable passes: visible page, visible summary, current selection, plain
  explanation, focused code investigation, and focused UI review.
- Stable failure: parent-owned Agent creation delegated to the repository
  specialist in all three runs.
- Intermittent wrong decision: repository settings lookup delegated in one of
  three runs.
- Planner timeouts: explicit Capability execution (1), operations (1),
  cross-domain review (2), and complete assessment (2).
- The switch remains inactive. The current router remains the production
  fallback.

This result rejects activation of the fully model-based planner. The next
candidate must deterministically keep known parent-owned actions with Kody and
use model judgment only for the remaining evidence/delegation decision.

## Candidate 3: one Kody turn with bounded specialist evidence — accepted locally

The route no longer decides ownership before Kody starts. Kody keeps its normal
turn and tools, with one additional `request_specialist_evidence` tool. That
tool reuses the existing isolated specialist executor and returns its findings
to the same parent model turn.

Runtime limits:

- only specialists assigned to the active Agent may run;
- at most three independent assignments;
- each specialist may appear once;
- the evidence tool may be called once per Kody turn;
- current page/preview context is passed into specialist work;
- Kody keeps responsibility for final decisions, actions, and presentation.

The old pre-turn gateway, candidate planner, early specialist response, and
separate presentation takeover are no longer on the main route.

### Corrected MiniMax M3 matrix

The original matrix supplied the same IANA page context to every prompt,
including repository implementation reviews. That made the cross-domain prompt
contradict its available evidence. Each scenario now supplies the page,
repository, CI, or product context its request actually references.

- Score: **36/36 (100%)** over three runs of all 12 scenarios.
- Parent-owned Agent creation, Capability execution, navigation, and assessment
  intake made zero specialist calls.
- Focused code, accessibility, and CI investigations selected exactly one
  matching specialist.
- Cross-domain review selected exactly three independent specialists.
- Visible page, summary, and selection questions remained with Kody.

This accepts the ownership policy locally. It does not by itself prove the
mounted Dashboard journey or a deployed candidate.
