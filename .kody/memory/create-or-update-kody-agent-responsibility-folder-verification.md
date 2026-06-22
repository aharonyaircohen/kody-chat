---
name: "create_or_update_kody_duty must verify folder shape"
description: "create_or_update_kody_duty must produce .kody/agent-responsibilities/<slug>/profile.json plus agent-responsibility.md; verify metadata/body split with read_duty after every create AND every update"
type: feedback
created: 2026-06-11T12:38:30.835Z
updated: 2026-06-14T00:00:00.000Z
---

When using `create_or_update_kody_duty` (the unified create + update tool), the agentResponsibility must live as a folder:

- `.kody/agent-responsibilities/<slug>/profile.json`
- `.kody/agent-responsibilities/<slug>/agent-responsibility.md`

Metadata such as `action`, `agentAction`, `every`, `staff`, `stage`, `mentions`, `readsFrom`, and `writesTo` belongs in `profile.json`. The `agent-responsibility.md` body should contain readable purpose, output, allowed commands, and restrictions, with no YAML frontmatter.

**Why:** AgentResponsibilities are no longer single markdown files. The old `.kody/agent-responsibilities/<slug>.md` frontmatter contract is legacy and should not be recreated. The same folder contract applies to BOTH the create and the update path of the tool — an update that bypasses the read-merge semantics and rewrites the wrong file is a regression.

**How to apply:** After every `create_or_update_kody_duty` call (CREATE or UPDATE), immediately call `read_duty` and verify the expected schedule, staff, disabled state, action, agentAction, and body. On UPDATE, also verify that fields the model did NOT pass are still preserved (read-merge semantics). If the metadata/body split is wrong, fix the agentResponsibility folder rather than creating a legacy markdown file.
