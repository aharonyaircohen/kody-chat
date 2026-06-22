# Kody memory index

One line per memory. The chat agent maintains this file — do not edit by hand.
Each entry: `- [Title](id.md) — one-line hook (type: <type>)`.
- [Briefing is a priority queue, not info](briefing-is-a-priority-queue-not-info.md) — Treat /briefing output as an ordered action list (Urgent → Needs decision → In progress → Can wait); execute the urgent items before asking the user anything else. (type: feedback)
- [create_or_update_kody_duty must verify folder shape](create-or-update-kody-agentResponsibility-folder-verification.md) — create_or_update_kody_duty must produce .kody/agent-responsibilities/<slug>/profile.json plus agent-responsibility.md; verify metadata/body split with read_duty after every create AND every update (type: feedback)
- [Don't invent labels — verify in repo](do-not-invent-labels.md) — Before claiming a label exists or proposing a new label name, verify it in the repo (gh label list / code search). Don't invent. (type: feedback)
- [github_close_issue is issues-only and parallel-safe-but-risky](github_close_issue-is-issues-only-and-parallel-safe-but-risky.md) — close_issue tool works on issues, NOT PRs; parallel close batches can silently no-op; always re-read state 5s+ later to verify (type: feedback)
- [Goal pipeline = engine, not agentResponsibility](goal-pipeline-engine-not-agent-responsibility.md) — Use engine plumbing for goal lifecycle, not scheduled agentResponsibilities (type: feedback)
- [Kody dispatch uses bare @kody](kody-dispatch-uses-bare-kody.md) — Use bare @kody comment to trigger pipeline, not @kody run (type: feedback)
- [Trust list_executables, not the create return shape](trust-list_executables-not-the-create-return-shape.md) — After any create_or_update_executable call, verify with list_executables — the create tool can return ok=true/action=created while the file is never actually written. (type: feedback)
- [chain agentActions need landing comment](chain-agentActions-need-landing-comment.md) — For multi-agentAction agentResponsibilities, use landing=comment so postflight is postAgentComment (not pr-branch lifecycle with strict COMMIT_MSG/PR_SUMMARY output). (type: project)
- [Voice wake-lock is a recurring issue](voice-wake-lock-recurring.md) — User has flagged \"voice screen dims on mobile\" multiple times; prior fixes haven't stuck — verify any new fix actually holds on Android Chrome before closing. (type: project)
