# Agent guidance

Kody keeps three agent-scoped kinds of durable guidance. Assign every entry to one or more agents from its page header.

## Context

Context records facts the agent should know: product vocabulary, customers, architecture, and current operating facts. Write statements that can be checked and updated when reality changes.

## Constraints

Constraints are hard limits the agent must never cross. Keep each constraint narrow and testable. State the forbidden action or required boundary directly, then describe the safe fallback.

Good: `Never force-push a shared branch. If history must change, create a new branch and ask for approval.`

Avoid preferences such as “usually,” “ideally,” or “when possible”; those belong in Policies.

## Policies

Policies are decision rules for choosing among actions that Constraints allow. Prefer explicit if/then language, identify exceptions, and name who may approve an override.

Good: `If a release changes persisted data, require a tested rollback plan before approval.`

Keep facts in Context and non-negotiable limits in Constraints. Split unrelated rules into separate files so ownership and agent assignment remain clear.
