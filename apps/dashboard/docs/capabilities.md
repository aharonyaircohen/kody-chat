# Capabilities

A Capability is one small executable method. It is stored as one folder:

```text
capabilities/<slug>/
├── instructions.md
├── contract.json
├── skills/
└── tools/
```

- `instructions.md` explains the work.
- `contract.json` declares `execution: "agent" | "script"`, one JSON input,
  one JSON output, and—only for trusted scripts—an optional exact `secrets`
  allowlist and `timeoutMs`.
- `skills/` contains optional reusable instruction files.
- `tools/` contains optional executable or tool configuration files.

A script-backed Capability must provide `tools/run.sh`. The script receives the
input in `KODY_CAPABILITY_INPUT` and `KODY_ARG_<NAME>` environment variables and
must return exactly one JSON value on stdout. An agent-backed Capability uses
`instructions.md`, optional skills, and tools.

A Capability does not select an Agent, model, schedule, permission mode, or
Workflow. Direct runs use Kody. To use another Agent, put the Capability in a
Workflow and select the Agent on that Workflow.

Use `create_or_update_capability` to create or replace the whole folder.
