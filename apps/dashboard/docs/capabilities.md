# Capabilities

A Capability is one small executable method. It is stored as one folder:

```text
capabilities/<slug>/
├── instructions.md
├── contract.json
├── skills/
└── tools/
```

- `instructions.md` explains how to produce the result.
- `contract.json` declares exactly one named input and one named output.
- `skills/` contains optional reusable instruction files.
- `tools/` contains optional executable or tool configuration files.

Example contract:

```json
{
  "input": {
    "name": "request",
    "schema": { "type": "object" }
  },
  "output": {
    "name": "result",
    "schema": { "type": "object" }
  }
}
```

A Capability does not select an Agent, model, schedule, permission mode, or
Workflow. Direct runs use Kody. To use another Agent, put the Capability in a
Workflow and select the Agent on that Workflow.

Use `create_or_update_capability` to create or replace the whole folder.
