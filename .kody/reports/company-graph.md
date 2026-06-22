---
slug: company-graph
dutySlug: company-graph
generatedAt: "2026-06-11T15:35:20Z"
findings:
  - id: company-graph.snapshot
    severity: low
    title: "Graph snapshot emitted"
    data: {"nodeCounts":{"context":4,"agent-responsibilities":28,"staff":7,"agentActions":14,"scripts":7,"skills":3,"reports":5,"goals":2,"issues":13},"graphHash":"7870b91838a38509df865b9283a1a42b51c4ff270aecc50b782dbd6c187c5e7b"}
  - id: company-graph.stale-context.ai-company-orchestration-plan
    severity: low
    title: "ai-company-orchestration-plan - not declared as reads_from by any agentResponsibility"
    data: {"context":"ai-company-orchestration-plan"}
  - id: company-graph.stale-context.ideas
    severity: low
    title: "ideas - not declared as reads_from by any agentResponsibility"
    data: {"context":"ideas"}
  - id: company-graph.stale-context.plan-and-split-execution
    severity: low
    title: "plan-and-split-execution - not declared as reads_from by any agentResponsibility"
    data: {"context":"plan-and-split-execution"}
  - id: company-graph.coverage-gap.commands
    severity: low
    title: "commands - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/commands"}
  - id: company-graph.coverage-gap.evals
    severity: low
    title: "evals - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/evals"}
  - id: company-graph.coverage-gap.events
    severity: low
    title: "events - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/events"}
  - id: company-graph.coverage-gap.memory
    severity: low
    title: "memory - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/memory"}
  - id: company-graph.coverage-gap.sessions
    severity: low
    title: "sessions - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/sessions"}
  - id: company-graph.coverage-gap.tasks
    severity: low
    title: "tasks - present in .kody/ but has no nodes"
    data: {"subfolder":".kody/tasks"}
---

# Company Graph

| Node type | Count |
|---|---:|
| context | 4 |
| agentResponsibilities | 28 |
| staff | 7 |
| agentActions | 14 |
| scripts | 7 |
| skills | 3 |
| reports | 5 |
| goals | 2 |
| issues | 13 |

Graph hash: `7870b91838a38509df865b9283a1a42b51c4ff270aecc50b782dbd6c187c5e7b`

## Graph
```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "context:ai-company-orchestration-plan",
      "type": "context",
      "slug": "ai-company-orchestration-plan",
      "staff": [
        "kody"
      ],
      "headingCount": 7
    },
    {
      "id": "context:ideas",
      "type": "context",
      "slug": "ideas",
      "staff": [
        "kody"
      ],
      "headingCount": 0
    },
    {
      "id": "context:orchestration-conventions",
      "type": "context",
      "slug": "orchestration-conventions",
      "staff": [
        "*"
      ],
      "headingCount": 3
    },
    {
      "id": "context:plan-and-split-execution",
      "type": "context",
      "slug": "plan-and-split-execution",
      "staff": [
        "kody"
      ],
      "headingCount": 6
    },
    {
      "id": "agentResponsibility:approval-gate",
      "type": "agentResponsibility",
      "slug": "approval-gate",
      "staff": "cto",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:architecture-audit",
      "type": "agentResponsibility",
      "slug": "architecture-audit",
      "staff": "cto",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:ceo-performance-review",
      "type": "agentResponsibility",
      "slug": "ceo-performance-review",
      "staff": "ceo",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:cleanup-branches",
      "type": "agentResponsibility",
      "slug": "cleanup-branches",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:clear-empty-goals",
      "type": "agentResponsibility",
      "slug": "clear-empty-goals",
      "staff": "",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:company-graph",
      "type": "agentResponsibility",
      "slug": "company-graph",
      "staff": "coo",
      "agentActions": [
        "company-graph"
      ],
      "readsFrom": [
        "orchestration-conventions"
      ],
      "writesTo": [
        "company-graph"
      ],
      "disabled": false
    },
    {
      "id": "agentResponsibility:coverage-floor",
      "type": "agentResponsibility",
      "slug": "coverage-floor",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:dead-code-sweep",
      "type": "agentResponsibility",
      "slug": "dead-code-sweep",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:dependency-bump",
      "type": "agentResponsibility",
      "slug": "dependency-bump",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:design-review",
      "type": "agentResponsibility",
      "slug": "design-review",
      "staff": "ux-designer",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:dev-ci-health",
      "type": "agentResponsibility",
      "slug": "dev-ci-health",
      "staff": "cto",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:docs-code",
      "type": "agentResponsibility",
      "slug": "docs-code",
      "staff": "tech-writer",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:docs-readme",
      "type": "agentResponsibility",
      "slug": "docs-readme",
      "staff": "tech-writer",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:agent-responsibility-review",
      "type": "agentResponsibility",
      "slug": "agent-responsibility-review",
      "staff": "coo",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:flaky-test-quarantine",
      "type": "agentResponsibility",
      "slug": "flaky-test-quarantine",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:health-check",
      "type": "agentResponsibility",
      "slug": "health-check",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:inbox-ping",
      "type": "agentResponsibility",
      "slug": "inbox-ping",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:job-gap-scan",
      "type": "agentResponsibility",
      "slug": "job-gap-scan",
      "staff": "ceo",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:pr-health-triage",
      "type": "agentResponsibility",
      "slug": "pr-health-triage",
      "staff": "cto",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:publish-release",
      "type": "agentResponsibility",
      "slug": "publish-release",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:qa",
      "type": "agentResponsibility",
      "slug": "qa",
      "staff": "qa",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:qa-sweep",
      "type": "agentResponsibility",
      "slug": "qa-sweep",
      "staff": "qa",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:qa-verify",
      "type": "agentResponsibility",
      "slug": "qa-verify",
      "staff": "qa",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": false
    },
    {
      "id": "agentResponsibility:redispatch",
      "type": "agentResponsibility",
      "slug": "redispatch",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:security-audit",
      "type": "agentResponsibility",
      "slug": "security-audit",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:system-audit",
      "type": "agentResponsibility",
      "slug": "system-audit",
      "staff": "coo",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:task-memory-extractor",
      "type": "agentResponsibility",
      "slug": "task-memory-extractor",
      "staff": "coo",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentResponsibility:type-debt",
      "type": "agentResponsibility",
      "slug": "type-debt",
      "staff": "kody",
      "agentActions": [],
      "readsFrom": [],
      "writesTo": [],
      "disabled": true
    },
    {
      "id": "agentAction:bug",
      "type": "agentAction",
      "slug": "bug",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Fix a bug / enhancement issue end-to-end in ONE session: reproduce with a failing test → research → plan → fix → verify, then branch, commit, open PR. Single-session — no multi-stage orchestration.",
      "skills": [
        "systematic-debugging"
      ],
      "shellScripts": [
        "install-codegraph.sh"
      ]
    },
    {
      "id": "agentAction:chore",
      "type": "agentAction",
      "slug": "chore",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Make a chore / docs / dep-bump change end-to-end in ONE session: minimal investigation → change → verify, then branch, commit, open PR. Low-ceremony (no heavy planning) — single-session, no multi-stage orchestration.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:classify",
      "type": "agentAction",
      "slug": "classify",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Classify an issue into one of {feature, bug, spec, chore} and dispatch the matching sub-orchestrator. Label-first fast path; LLM fallback when labels don't decide.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:company-graph",
      "type": "agentAction",
      "slug": "company-graph",
      "role": "primitive",
      "kind": "oneshot",
      "staff": "",
      "describe": "Derive the company orchestration graph from .kody files and refresh .kody/reports/company-graph.md.",
      "skills": [
        "company-graph"
      ],
      "shellScripts": [
        "refresh-company-graph.sh"
      ]
    },
    {
      "id": "agentAction:feature",
      "type": "agentAction",
      "slug": "feature",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Implement a feature / refactor issue end-to-end in ONE session: research → plan → build → test → verify, then branch, commit, open PR. Single-session — no multi-stage orchestration.",
      "skills": [],
      "shellScripts": [
        "install-codegraph.sh"
      ]
    },
    {
      "id": "agentAction:fix",
      "type": "agentAction",
      "slug": "fix",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Apply review feedback to an existing PR branch.",
      "skills": [
        "systematic-debugging"
      ],
      "shellScripts": []
    },
    {
      "id": "agentAction:fix-ci",
      "type": "agentAction",
      "slug": "fix-ci",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Fix a failing CI workflow on an existing PR.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:plan",
      "type": "agentAction",
      "slug": "plan",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Research an issue and produce a concrete implementation plan as a comment. Read-only — no branches, no commits.",
      "skills": [],
      "shellScripts": [
        "install-codegraph.sh"
      ]
    },
    {
      "id": "agentAction:qa-engineer",
      "type": "agentAction",
      "slug": "qa-engineer",
      "role": "primitive",
      "kind": "oneshot",
      "staff": "",
      "describe": "Free-form QA: browses a running site with Playwright MCP, explores routes, exercises UI states, posts a structured QA report. Opens a new issue per run by default; pass --issue <N> to comment on an existing one. Read-only on the repo.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:reproduce",
      "type": "agentAction",
      "slug": "reproduce",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Write a failing test that reproduces a bug. Do NOT fix the bug — leave the test failing and capture the failure signature so subsequent fix verification can confirm the same failure mode.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:research",
      "type": "agentAction",
      "slug": "research",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Research an issue: understand the ask, map relevant repo context, and surface clarifying questions + gaps. Read-only — no branches, no commits, no prescribed next steps.",
      "skills": [],
      "shellScripts": [
        "install-codegraph.sh"
      ]
    },
    {
      "id": "agentAction:review",
      "type": "agentAction",
      "slug": "review",
      "role": "primitive",
      "kind": "",
      "staff": "",
      "describe": "Read-only structured review of an open PR. Posts one comment, never commits.",
      "skills": [],
      "shellScripts": [
        "install-codegraph.sh"
      ]
    },
    {
      "id": "agentAction:spec",
      "type": "agentAction",
      "slug": "spec",
      "role": "orchestrator",
      "kind": "",
      "staff": "",
      "describe": "Sub-orchestrator for spec / RFC / design-doc issues — research → plan (stop). Terminates at the plan artifact; no run, no PR. No agent.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "agentAction:ui-review",
      "type": "agentAction",
      "slug": "ui-review",
      "role": "primitive",
      "kind": "oneshot",
      "staff": "",
      "describe": "UI/UX review of an open PR: browses the running preview with Playwright, compares behavior to diff intent, posts one structured review comment. Read-only on the repo (no commits); writes a throwaway Playwright spec under .kody/.",
      "skills": [],
      "shellScripts": []
    },
    {
      "id": "goal:ai-company-orchestration-7-gap-plan",
      "type": "goal",
      "slug": "ai-company-orchestration-7-gap-plan",
      "label": "goal:ai-company-orchestration-7-gap-plan"
    },
    {
      "id": "goal:kody-state-split",
      "type": "goal",
      "slug": "kody-state-split",
      "label": "goal:kody-state-split"
    },
    {
      "id": "issue:50",
      "type": "issue",
      "number": 50,
      "title": "[kody-state-split] 1/5 — Engine: dual-write all state to .kody/state/** on kody-state",
      "state": "OPEN"
    },
    {
      "id": "issue:51",
      "type": "issue",
      "number": 51,
      "title": "[kody-state-split] 2/5 — Migrate existing scattered state files to .kody/state/**",
      "state": "OPEN"
    },
    {
      "id": "issue:52",
      "type": "issue",
      "number": 52,
      "title": "[kody-state-split] 3/5 — Flip readers (dashboard + engine) to new path/branch; unify accessor",
      "state": "OPEN"
    },
    {
      "id": "issue:53",
      "type": "issue",
      "number": 53,
      "title": "[kody-state-split] 4/5 — Stop dual-write, delete stale state from default branch",
      "state": "OPEN"
    },
    {
      "id": "issue:54",
      "type": "issue",
      "number": 54,
      "title": "[kody-state-split] 5/5 — CI path-filter + fix writers hardcoding default branch",
      "state": "OPEN"
    },
    {
      "id": "issue:90",
      "type": "issue",
      "number": 90,
      "title": "[Orchestration] Done-claim protocol — `<!-- claim -->` / `<!-- done -->` markers on issues",
      "state": "CLOSED"
    },
    {
      "id": "issue:91",
      "type": "issue",
      "number": 91,
      "title": "[Orchestration] Report schema — shared YAML frontmatter in `.kody/reports/_schema.yaml`",
      "state": "CLOSED"
    },
    {
      "id": "issue:92",
      "type": "issue",
      "number": 92,
      "title": "[Orchestration] AgentResponsibility contracts — `reads_from` / `writes_to` / `done_when` in agentResponsibility frontmatter",
      "state": "OPEN"
    },
    {
      "id": "issue:93",
      "type": "issue",
      "number": 93,
      "title": "[Orchestration] Multi-section ledger — priorities, domain-state, blockers, decisions as labeled GitHub issues",
      "state": "OPEN"
    },
    {
      "id": "issue:94",
      "type": "issue",
      "number": 94,
      "title": "[Orchestration] Escalation markers — `<!-- escalate-to-human -->` with inbox notification",
      "state": "OPEN"
    },
    {
      "id": "issue:95",
      "type": "issue",
      "number": 95,
      "title": "[Orchestration] Aggregated report layer — CEO digest agentResponsibility reading all chief reports",
      "state": "CLOSED"
    },
    {
      "id": "issue:96",
      "type": "issue",
      "number": 96,
      "title": "[Orchestration] Write-back channel — CEO comments on chief ledgers as plain text",
      "state": "OPEN"
    },
    {
      "id": "issue:97",
      "type": "issue",
      "number": 97,
      "title": "[Dashboard] Add create_goal tool",
      "state": "OPEN"
    },
    {
      "id": "report:ceo-performance-review",
      "type": "report",
      "slug": "ceo-performance-review"
    },
    {
      "id": "report:clear-empty-goals",
      "type": "report",
      "slug": "clear-empty-goals"
    },
    {
      "id": "report:company-graph",
      "type": "report",
      "slug": "company-graph",
      "missing": true
    },
    {
      "id": "report:docs-code",
      "type": "report",
      "slug": "docs-code"
    },
    {
      "id": "report:docs-readme",
      "type": "report",
      "slug": "docs-readme"
    },
    {
      "id": "script:bug/install-codegraph.sh",
      "type": "script",
      "slug": "bug/install-codegraph.sh",
      "path": ".kody/agent-actions/bug/install-codegraph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:company-graph/refresh-company-graph.sh",
      "type": "script",
      "slug": "company-graph/refresh-company-graph.sh",
      "path": ".kody/agent-actions/company-graph/refresh-company-graph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:feature/install-codegraph.sh",
      "type": "script",
      "slug": "feature/install-codegraph.sh",
      "path": ".kody/agent-actions/feature/install-codegraph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:plan/install-codegraph.sh",
      "type": "script",
      "slug": "plan/install-codegraph.sh",
      "path": ".kody/agent-actions/plan/install-codegraph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:research/install-codegraph.sh",
      "type": "script",
      "slug": "research/install-codegraph.sh",
      "path": ".kody/agent-actions/research/install-codegraph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:review/install-codegraph.sh",
      "type": "script",
      "slug": "review/install-codegraph.sh",
      "path": ".kody/agent-actions/review/install-codegraph.sh",
      "scope": "agentAction"
    },
    {
      "id": "script:validate-reports",
      "type": "script",
      "slug": "validate-reports",
      "path": ".kody/scripts/validate-reports.sh",
      "scope": "repo"
    },
    {
      "id": "skill:bug/systematic-debugging",
      "type": "skill",
      "slug": "bug/systematic-debugging",
      "name": "systematic-debugging",
      "path": ".kody/agent-actions/bug/skills/systematic-debugging/SKILL.md",
      "scope": "agentAction"
    },
    {
      "id": "skill:company-graph/company-graph",
      "type": "skill",
      "slug": "company-graph/company-graph",
      "name": "company-graph",
      "path": ".kody/agent-actions/company-graph/skills/company-graph/SKILL.md",
      "scope": "agentAction"
    },
    {
      "id": "skill:fix/systematic-debugging",
      "type": "skill",
      "slug": "fix/systematic-debugging",
      "name": "systematic-debugging",
      "path": ".kody/agent-actions/fix/skills/systematic-debugging/SKILL.md",
      "scope": "agentAction"
    },
    {
      "id": "staff:ceo",
      "type": "staff",
      "slug": "ceo",
      "headingCount": 4
    },
    {
      "id": "staff:coo",
      "type": "staff",
      "slug": "coo",
      "headingCount": 4
    },
    {
      "id": "staff:cto",
      "type": "staff",
      "slug": "cto",
      "headingCount": 4
    },
    {
      "id": "staff:kody",
      "type": "staff",
      "slug": "kody",
      "headingCount": 4
    },
    {
      "id": "staff:qa",
      "type": "staff",
      "slug": "qa",
      "headingCount": 4
    },
    {
      "id": "staff:tech-writer",
      "type": "staff",
      "slug": "tech-writer",
      "headingCount": 4
    },
    {
      "id": "staff:ux-designer",
      "type": "staff",
      "slug": "ux-designer",
      "headingCount": 4
    }
  ],
  "edges": [
    {
      "id": "context:ai-company-orchestration-plan->audience->staff:kody",
      "from": "context:ai-company-orchestration-plan",
      "to": "staff:kody",
      "relation": "audience"
    },
    {
      "id": "context:ideas->audience->staff:kody",
      "from": "context:ideas",
      "to": "staff:kody",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:ceo",
      "from": "context:orchestration-conventions",
      "to": "staff:ceo",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:coo",
      "from": "context:orchestration-conventions",
      "to": "staff:coo",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:cto",
      "from": "context:orchestration-conventions",
      "to": "staff:cto",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:kody",
      "from": "context:orchestration-conventions",
      "to": "staff:kody",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:qa",
      "from": "context:orchestration-conventions",
      "to": "staff:qa",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:tech-writer",
      "from": "context:orchestration-conventions",
      "to": "staff:tech-writer",
      "relation": "audience"
    },
    {
      "id": "context:orchestration-conventions->audience->staff:ux-designer",
      "from": "context:orchestration-conventions",
      "to": "staff:ux-designer",
      "relation": "audience"
    },
    {
      "id": "context:plan-and-split-execution->audience->staff:kody",
      "from": "context:plan-and-split-execution",
      "to": "staff:kody",
      "relation": "audience"
    },
    {
      "id": "agentResponsibility:approval-gate->assigned_to->staff:cto",
      "from": "agentResponsibility:approval-gate",
      "to": "staff:cto",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:architecture-audit->assigned_to->staff:cto",
      "from": "agentResponsibility:architecture-audit",
      "to": "staff:cto",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:ceo-performance-review->assigned_to->staff:ceo",
      "from": "agentResponsibility:ceo-performance-review",
      "to": "staff:ceo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:cleanup-branches->assigned_to->staff:kody",
      "from": "agentResponsibility:cleanup-branches",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:company-graph->assigned_to->staff:coo",
      "from": "agentResponsibility:company-graph",
      "to": "staff:coo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:company-graph->reads_from->context:orchestration-conventions",
      "from": "agentResponsibility:company-graph",
      "to": "context:orchestration-conventions",
      "relation": "reads_from"
    },
    {
      "id": "agentResponsibility:company-graph->runs->agentAction:company-graph",
      "from": "agentResponsibility:company-graph",
      "to": "agentAction:company-graph",
      "relation": "runs"
    },
    {
      "id": "agentResponsibility:company-graph->writes_to->report:company-graph",
      "from": "agentResponsibility:company-graph",
      "to": "report:company-graph",
      "relation": "writes_to"
    },
    {
      "id": "agentResponsibility:coverage-floor->assigned_to->staff:kody",
      "from": "agentResponsibility:coverage-floor",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:dead-code-sweep->assigned_to->staff:kody",
      "from": "agentResponsibility:dead-code-sweep",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:dependency-bump->assigned_to->staff:kody",
      "from": "agentResponsibility:dependency-bump",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:design-review->assigned_to->staff:ux-designer",
      "from": "agentResponsibility:design-review",
      "to": "staff:ux-designer",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:dev-ci-health->assigned_to->staff:cto",
      "from": "agentResponsibility:dev-ci-health",
      "to": "staff:cto",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:docs-code->assigned_to->staff:tech-writer",
      "from": "agentResponsibility:docs-code",
      "to": "staff:tech-writer",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:docs-readme->assigned_to->staff:tech-writer",
      "from": "agentResponsibility:docs-readme",
      "to": "staff:tech-writer",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:agent-responsibility-review->assigned_to->staff:coo",
      "from": "agentResponsibility:agent-responsibility-review",
      "to": "staff:coo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:flaky-test-quarantine->assigned_to->staff:kody",
      "from": "agentResponsibility:flaky-test-quarantine",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:health-check->assigned_to->staff:kody",
      "from": "agentResponsibility:health-check",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:inbox-ping->assigned_to->staff:kody",
      "from": "agentResponsibility:inbox-ping",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:job-gap-scan->assigned_to->staff:ceo",
      "from": "agentResponsibility:job-gap-scan",
      "to": "staff:ceo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:pr-health-triage->assigned_to->staff:cto",
      "from": "agentResponsibility:pr-health-triage",
      "to": "staff:cto",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:publish-release->assigned_to->staff:kody",
      "from": "agentResponsibility:publish-release",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:qa->assigned_to->staff:qa",
      "from": "agentResponsibility:qa",
      "to": "staff:qa",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:qa-sweep->assigned_to->staff:qa",
      "from": "agentResponsibility:qa-sweep",
      "to": "staff:qa",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:qa-verify->assigned_to->staff:qa",
      "from": "agentResponsibility:qa-verify",
      "to": "staff:qa",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:redispatch->assigned_to->staff:kody",
      "from": "agentResponsibility:redispatch",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:security-audit->assigned_to->staff:kody",
      "from": "agentResponsibility:security-audit",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:system-audit->assigned_to->staff:coo",
      "from": "agentResponsibility:system-audit",
      "to": "staff:coo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:task-memory-extractor->assigned_to->staff:coo",
      "from": "agentResponsibility:task-memory-extractor",
      "to": "staff:coo",
      "relation": "assigned_to"
    },
    {
      "id": "agentResponsibility:type-debt->assigned_to->staff:kody",
      "from": "agentResponsibility:type-debt",
      "to": "staff:kody",
      "relation": "assigned_to"
    },
    {
      "id": "agentAction:bug->runs_preflight->script:bug/install-codegraph.sh",
      "from": "agentAction:bug",
      "to": "script:bug/install-codegraph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "agentAction:bug->uses_skill->skill:bug/systematic-debugging",
      "from": "agentAction:bug",
      "to": "skill:bug/systematic-debugging",
      "relation": "uses_skill"
    },
    {
      "id": "agentAction:company-graph->runs_preflight->script:company-graph/refresh-company-graph.sh",
      "from": "agentAction:company-graph",
      "to": "script:company-graph/refresh-company-graph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "agentAction:company-graph->uses_skill->skill:company-graph/company-graph",
      "from": "agentAction:company-graph",
      "to": "skill:company-graph/company-graph",
      "relation": "uses_skill"
    },
    {
      "id": "agentAction:feature->runs_preflight->script:feature/install-codegraph.sh",
      "from": "agentAction:feature",
      "to": "script:feature/install-codegraph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "agentAction:fix->uses_skill->skill:fix/systematic-debugging",
      "from": "agentAction:fix",
      "to": "skill:fix/systematic-debugging",
      "relation": "uses_skill"
    },
    {
      "id": "agentAction:plan->runs_preflight->script:plan/install-codegraph.sh",
      "from": "agentAction:plan",
      "to": "script:plan/install-codegraph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "agentAction:research->runs_preflight->script:research/install-codegraph.sh",
      "from": "agentAction:research",
      "to": "script:research/install-codegraph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "agentAction:review->runs_preflight->script:review/install-codegraph.sh",
      "from": "agentAction:review",
      "to": "script:review/install-codegraph.sh",
      "relation": "runs_preflight"
    },
    {
      "id": "issue:50->labeled->goal:kody-state-split",
      "from": "issue:50",
      "to": "goal:kody-state-split",
      "relation": "labeled"
    },
    {
      "id": "issue:51->labeled->goal:kody-state-split",
      "from": "issue:51",
      "to": "goal:kody-state-split",
      "relation": "labeled"
    },
    {
      "id": "issue:52->labeled->goal:kody-state-split",
      "from": "issue:52",
      "to": "goal:kody-state-split",
      "relation": "labeled"
    },
    {
      "id": "issue:53->labeled->goal:kody-state-split",
      "from": "issue:53",
      "to": "goal:kody-state-split",
      "relation": "labeled"
    },
    {
      "id": "issue:54->labeled->goal:kody-state-split",
      "from": "issue:54",
      "to": "goal:kody-state-split",
      "relation": "labeled"
    },
    {
      "id": "issue:90->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:90",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:91->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:91",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:92->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:92",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:93->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:93",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:94->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:94",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:95->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:95",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:96->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:96",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    },
    {
      "id": "issue:97->labeled->goal:ai-company-orchestration-7-gap-plan",
      "from": "issue:97",
      "to": "goal:ai-company-orchestration-7-gap-plan",
      "relation": "labeled"
    }
  ],
  "coverageGaps": [
    "commands",
    "evals",
    "events",
    "memory",
    "sessions",
    "tasks"
  ]
}
```
