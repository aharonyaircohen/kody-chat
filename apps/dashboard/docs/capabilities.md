# Capabilities

A Capability is one small executable method. It is stored as one folder:

```text
capabilities/<slug>/
├── instructions.md
├── skills/
└── tools/
```

- `instructions.md` explains the one input value, the work, and the one output value.
- `skills/` contains optional reusable instruction files.
- `tools/` contains optional executable or tool configuration files.

A Capability does not select an Agent, model, schedule, permission mode, or
Workflow. Direct runs use Kody. To use another Agent, put the Capability in a
Workflow and select the Agent on that Workflow.

Use `create_or_update_capability` to create or replace the whole folder.
