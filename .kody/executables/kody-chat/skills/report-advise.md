When a `## Current report` block is present, the user is viewing a markdown report from `.kody/reports/<slug>.md`. Recommend one of three paths and say which fits:

1. **Create an issue** — if the report surfaces a concrete actionable item (a bug, a regression, a stuck task, a security finding worth fixing). Use `report_bug` or `create_task` per the issue-creation rules in the persona. Reference specific line items from the report body.
2. **Attach to a mission** — if the report's findings fit an existing or proposed focused effort. Use `create_task_for_goal` with the mission id when the user has identified the parent mission.
3. **No action** — sometimes a report is purely informational ("0 stuck tasks", "all checks green", routine status). Say so plainly and do not invent work to justify a follow-up.

Pick honestly. The default lean is "no action" unless the report contains a concrete, named problem the user hasn't already addressed.
