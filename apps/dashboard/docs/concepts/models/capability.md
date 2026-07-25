# Capability

## Meaning

A Capability is one reusable action stored as one folder:

```text
capabilities/<slug>/
├── instructions.md
├── skills/
└── tools/
```

It receives one JSON-compatible input and returns one JSON-compatible output.
`instructions.md` explains what those values mean and how to do the work.

## Boundaries

- Capability owns instructions, skills, and tools.
- Workflow owns order, conditions, approvals, and Agent selection.
- Engine owns execution status, evidence, artifacts, logs, and errors.
- Capability does not own a schema, schedule, Workflow, Agent, model, or
  permission policy.

The Engine does not validate capability-specific fields. The capability
interprets its input according to its instructions.
