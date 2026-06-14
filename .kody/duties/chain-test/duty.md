# Chain test (spike)

## Job

Spike to confirm the engine's task-jobs mechanism chains multiple executables in order. If this works, the release duty architecture is sound.

## Inputs

- no manual inputs — duty is fired by @kody chain-test comment or manual tick

## Output

Refresh `kody-state:.kody/reports/chain-test.md` with a report that follows this findings shape:

```yaml
slug: chain-test
generatedAt: <ISO 8601 timestamp>
findings:
findings: []  # spike has no report
```

## Allowed Commands

- Use only the minimum read/write tools needed to refresh `kody-state:.kody/reports/chain-test.md`.
- gh issue list
- gh issue view
- gh issue comment

## Restrictions

- Never edit source files from this duty.
- Never write outside `kody-state:.kody/reports/chain-test.md` unless the user changes the duty contract.
- Maximum one report refresh per tick.
- Spike only — do not edit source files
- Do not run any executable other than the chained noops
