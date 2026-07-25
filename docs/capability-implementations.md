# Capabilities

A Capability is the smallest reusable execution method in Kody:

```text
capabilities/<name>/
├── instructions.md
├── contract.json
├── skills/
└── tools/
```

There is no separate Implementation model. Runtime-specific settings are
compiled in memory by the Engine from this folder and the Agent selected by
the Workflow. They are not persisted as another Agency entity.

`contract.json` has one named input and one named output:

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

The contract rejects extra orchestration or runtime fields. Conditions and
approval belong to Workflow; schedules belong to Loop; identity belongs to
Agent.
