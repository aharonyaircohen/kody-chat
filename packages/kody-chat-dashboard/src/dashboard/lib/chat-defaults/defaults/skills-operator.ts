/**
 * create-* skills — operator workflows.
 * Source: AGENT_KODY.systemPrompt § "Create issue / Create Kody capability / Create Kody agent".
 */

import type { SkillEntry } from "./types";

export const DEFAULT_SKILL_CREATE_ISSUE: SkillEntry = {
  slug: "create-issue",
  title: "create-issue",
  body: `If \`## Current task\` is present and the user is asking to fix / change / continue **that** issue (not clearly separate work), do NOT call \`create_*\` / \`report_bug\` — that creates a duplicate issue. Treat the selected issue as the artifact: research, agree on missing scope, and suggest the issue text/comment the user should add. If the user asks to run or implement it, say it is ready to run from the issue workflow outside Kody chat. Only create a new issue if the request is unmistakably unrelated to the current task, and say so first.

Never call \`create_*\` / \`report_bug\` on first turn.

1. Research first (3–5 tool calls). Do not ask for permission before research, checks, verification, or analysis.
2. Ask at most one blocking gap-closing question only after research, and only if the answer changes scope, data safety, user-facing behavior, or acceptance criteria. Use repo evidence and sensible defaults for everything else.
3. Show title + body once for approval, then call the matching tool:
   - bug → \`report_bug\` · new capability → \`create_feature\` · improvement → \`create_enhancement\` · restructure → \`create_refactor\` · docs → \`create_documentation\` · deps/config → \`create_chore\`.
4. \`additionalContext\` MUST end with **Research notes**: 2–4 bullets, file:line evidence ("no matches" is valid). Paths in \`affectedArea\` and symbols in \`requirements\` MUST come from tool results this session.`,
};

export const DEFAULT_SKILL_CREATE_CAPABILITY: SkillEntry = {
  slug: "create-capability",
  title: "create-capability",
  body: `A Capability is exactly one folder with \`instructions.md\`, \`contract.json\`, \`skills/\`, and \`tools/\`. It receives one JSON-compatible input and returns one JSON-compatible output. Choose \`execution: "script"\` for exact repeatable work and provide \`tools/run.sh\`; otherwise choose \`execution: "agent"\`. Declare execution, input, and output in \`contract.json\`; explain the work in \`instructions.md\`. First call \`read_capability_creation_guide\`. Never first turn.

Sufficiency: folder name, clear instructions, one input, one output, needed tools, and optional skills. A direct Capability uses Kody; a Workflow chooses one Agent for all its steps. Show the folder contents, then call \`create_or_update_capability\` only after the user approves.

Do not put an Agent identity, model, Workflow, schedule, lifecycle, runtime profile, or approval policy in a Capability folder.`,
};

export const DEFAULT_SKILL_CREATE_AGENT: SkillEntry = {
  slug: "create-agent",
  title: "create-agent",
  body: `Backend agent \`agents/<slug>.md\` — a pure reusable identity record (intent, allowed commands, restrictions). Agents have no schedule, no state, no run/tick; they're agent identities referenced by other flows. Same gap loop and sufficiency bar as Create Kody capability. Show body, then call \`create_kody_agent\`.`,
};

export const DEFAULT_SKILL_CREATE_WORKFLOW: SkillEntry = {
  slug: "create-workflow",
  title: "create-workflow",
  body: `A workflow is one validated ordered run of existing capabilities. Research the request and current capabilities first, show the proposed graph and handoffs, then create an approved issue and call \`run_workflow_creator\`. Never write workflow files from chat and never call the creator on the first turn.`,
};
