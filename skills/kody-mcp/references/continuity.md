# Memory and work continuity

Search repository memories and existing work using the task topics before relying on unstated context. Read full records as needed. Check claims against current code and user instructions; memory does not override either.

## Put information in its existing home

| Information | Destination |
| --- | --- |
| Durable facts, agreed decisions, preferences, useful references | Memory |
| Task objective, progress, blockers, evidence, next steps, handoff | Todos through `work.*` actions |
| Source code and project instructions | Repository files |
| Credentials | Configured secret storage; never memory or work notes |

Before saving knowledge, search for an existing record about the same subject. Correct that record when appropriate instead of creating a competing copy. Save a focused statement with enough context to understand where it applies, why it matters, and what supports it. Distinguish an observed fact, a user-approved decision, and an unverified hypothesis. Do not label an agent inference as user input.

Use actual source references supported by the action schema: a repository path and commit, work record, test result, or document. Keep returned memory/work IDs and revision IDs for subsequent updates. A source reference supports inspection; it does not by itself prove the claim.

Do not save raw conversations, hidden reasoning, secrets, or routine tool output. Save only information that will change a future agent's decisions. Creating a work record is useful for multi-step or resumable tasks; reuse the current task record instead of creating one for each turn.

## Checkpoint meaningful progress

Update work at a milestone, blocker, change of direction, or handoff—not after every response. Use the discovered checkpoint/evidence/handoff actions on the same work record.

A useful checkpoint contains:

- Objective and current state.
- Completed changes and where they are located.
- Verification actually performed, with result and source.
- Uncommitted work and commit/deployment status when relevant.
- Remaining steps, blockers, and the next concrete action.

Keep local test success, commit/push, deployment, and production proof distinct. Before ending substantial work, save any newly established durable knowledge and a checkpoint if work remains. Briefly report a persistence failure rather than implying the handoff was saved.

On resumption, read the checkpoint and relevant memory, then verify the current repository and deployment state before acting. Follow durable IDs or source references returned by Kody; do not invent them.

## Memory lifecycle

Revise corrects a memory; retire marks it no longer current while preserving history; delete removes it and its history. Delete only within explicit user authorization, never as a fallback for failed retirement. Apply the entrypoint's common write and retry rules.

## Initial trial boundaries

The initial coding-agent trial uses repository scope and one memory-writing agent at a time. Do not infer permission to use personal scope from token grants alone. Expand the trial only after personal UI/MCP identity and concurrent-write behavior are verified and the user chooses that scope.

Do not rely on retirement or automatic retries until their deployed behavior has been verified. If stale knowledge cannot be retired, record the conflict in the work checkpoint and avoid relying on it; preserve the original record.

If Kody is unavailable, continue work that does not require missing context, state the continuity gap, and include an unsaved checkpoint in the handoff. Do not silently create another durable memory system.
