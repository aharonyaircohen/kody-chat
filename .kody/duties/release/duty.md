# Release

## Job

Trigger the four-stage release container. Chains release-prepare, release-merge, release-tag, release-promote in order via the engine's task-jobs mechanism.

## Executables

This duty runs the following executables in order:

- `release-prepare`
- `release-merge`
- `release-tag`
- `release-promote`

Each executable's skills and scripts own its implementation details.

## Allowed Commands

- Run the `release-prepare` executable.
- Run the `release-merge` executable.
- Run the `release-tag` executable.
- Run the `release-promote` executable.

## Restrictions

- Stay within the duty's purpose and the per-executable rules.
- Do not perform actions outside the contract defined by this duty.
