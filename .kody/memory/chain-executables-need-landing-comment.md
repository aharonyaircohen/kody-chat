---
name: "chain executables need landing comment"
description: "For multi-executable duties, use landing=comment so postflight is postAgentComment (not pr-branch lifecycle with strict COMMIT_MSG/PR_SUMMARY output)."
type: project
created: 2026-06-14T14:56:39.239Z
---

For multi-executable duties (`executables: [...]` arrays in `.kody/duties/<slug>/profile.json`), each executable in the chain must use `landing: "comment"` when created via `create_or_update_executable`. If `landing: "pr"` is used, the tool infers `lifecycle: "pr-branch"` and a strict output format (`DONE / COMMIT_MSG: <msg> / PR_SUMMARY: <bullets>`) that the postflight parser enforces — which is incompatible with custom hand-off fields like `PREP_PR: <url>`.

**Why:** the chain-test spike (`chain-test` duty chaining `noop-1` → `noop-2`) proved the architecture works only with `landing: "comment"`. The first `release-prepare` I created with `landing: "pr"` landed in the repo but had `lifecycle: "pr-branch"` baked in, and its prompt asked for `PREP_PR: <url>` output that the strict format rejected.

**How to apply:** when creating a chain executable, always pass `landing: "comment"`. Verify the resulting `profile.json` has `scripts.postflight: [parseAgentResult, postAgentComment]` and no `lifecycle` / `lifecycleConfig` blocks. The next-stage hand-off is via the `PR_SUMMARY` block in the agent's final message, which `postAgentComment` posts as a comment on the issue; the next stage reads the comment.
