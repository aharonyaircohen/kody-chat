---
name: "Goal pipeline = engine, not agentResponsibility"
description: "Use engine plumbing for goal lifecycle, not scheduled agentResponsibilities"
type: feedback
created: 2026-06-07T19:46:06.063Z
---

When fixing goal management (issue #102), the pipeline should live in engine plumbing (engine reads goal state files) not as a scheduled agentResponsibility. User explicitly corrected this — prefer engine-driven approach over cron-based agentResponsibilities for goal lifecycle.

**Why:** AgentResponsibilities are for periodic monitoring (CI failures, stale PRs). Goal lifecycle (decompose → build → QA → PR) is event-driven and triggered from the manage endpoint.

**How to apply:** When working on goal pipeline, look at how `manage/route.ts` dispatches the engine and what inputs the engine receives — not at `.kody/agent-responsibilities/`.
