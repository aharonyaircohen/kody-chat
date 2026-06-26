# Capability implementation storage

Capability is the product word. This page exists because older storage, APIs,
and config keys still use `executable` in names. Treat that word as a legacy
storage name for a capability implementation.

The operator-facing model is:

```text
Capability = contract + implementation
```

The contract says what the capability is allowed to do. The implementation
contains the prompt glue, scripts, skills, tools, and output contract that make
the capability run.

## Storage

The current dashboard creates capabilities under:

```text
.kody/capabilities/<slug>/
  profile.json
  capability.md
  skills/
  *.sh
```

Some repos still have implementation folders under the legacy path:

```text
.kody/executables/<slug>/
  profile.json
  prompt.md
  skills/
  *.sh
```

Those folders still load for compatibility. Do not introduce that vocabulary in
new user-facing docs or chat copy unless you are naming the legacy path or a
real config field.

## Ownership

Capability contract owns:

- public action name
- kind: `observe`, `act`, or `verify`
- cadence
- agent and reviewer
- inputs and output expectations
- safety boundaries

Capability implementation owns:

- prompt glue
- local scripts
- skills
- MCP/tool wiring
- result landing and output contract

Agent owns identity only. Goal owns long-term progress. Loop owns cadence and
wake-up behavior.

## Legacy field names

Keep these names when editing config or engine-compatible JSON:

| Field | Meaning |
| --- | --- |
| `executable` | Implementation slug for a capability. |
| `executables` | Ordered implementation list for a multi-step capability. |
| `agent.perExecutable` | Legacy config map for per-capability model overrides. |
| `defaultExecutable` | Legacy config field for the bare issue action. |
| `defaultPrExecutable` | Legacy config field for the bare PR action. |

In prose, explain those fields as implementation/action configuration, not as a
separate model.

## Creation Rule

For new work, create a capability first. Add implementation details only when
the capability needs custom behavior.

Good capability body:

```md
# Broken link report

## Job

Check the docs for broken links and refresh the report.

## Implementation

Run the `broken-link-report` implementation.

## Output

Refresh `.kody/reports/broken-link-report.md`.

## Restrictions

- Do not edit source files.
- Only update the generated report.
```

Bad capability body:

```md
You are a senior engineer. Run curl, parse JSON, call gh, then...
```

Long method belongs in implementation skills or scripts, not in the capability
contract.

## File Reference

| File | Purpose |
| --- | --- |
| [`../src/dashboard/lib/executables/files.ts`](../src/dashboard/lib/executables/files.ts) | Legacy implementation folder CRUD. |
| [`../src/dashboard/lib/executables/profile.ts`](../src/dashboard/lib/executables/profile.ts) | Profile validation and form mapping. |
| [`../src/dashboard/lib/components/ExecutablesManager.tsx`](../src/dashboard/lib/components/ExecutablesManager.tsx) | Compatibility UI implementation. |
| [`../app/api/kody/capabilities/`](../app/api/kody/capabilities/) | Current capability API. |
| [`./capabilities.md`](./capabilities.md) | Canonical capability authoring guide. |
