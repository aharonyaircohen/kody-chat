# Task Verifier

## Job

Scan the backlog every hour. For each open issue with zero labels (oldest first), run deep analysis: read the body, search the repo for keywords and duplicates, check for conflicts with existing patterns, estimate blast radius. Decide a verdict and add labels: `status:verified` + a work-type label + a `priority:*` label if safe to dispatch, or `status:needs-human` if a human must look. Post a one-paragraph summary comment explaining the verdict.

## Executable

Run the `task-verifier` executable. Its skills and scripts own the implementation details.

## Allowed Commands

- Run the `task-verifier` executable.

## Restrictions

- Stay within the duty's purpose and the per-executable rules.
- Do not perform actions outside the contract defined by this duty.
- Process ONE issue per tick. Do not batch.
- Never re-evaluate an issue that already has `status:verified` or `status:needs-human`.
- Never strip or override a verdict label that a human or a previous tick applied.
- Read-only on source files. No edits, no git push.
