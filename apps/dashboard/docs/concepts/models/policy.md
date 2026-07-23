# Policy

Status: **Draft** · Kind: **Reusable definition**

A Policy is a reusable governance package that limits authority, approvals,
budgets, concurrency, and risky actions. It never grants authority unavailable
to the tenant, environment, Agent, or Capability.

The current domain value contains approval mode, allow/deny actions, run/token/
cost/duration budgets, maximum concurrency, and risky actions. The approved
target makes Policies independently referenceable by Intents; embedded Policy
fields remain a migration gap.

Composition is fail-closed:

- allowed actions are intersected;
- denied actions are unioned and override allow;
- numeric limits use the minimum;
- approval uses the strongest requirement;
- risky/human-required actions are unioned;
- incompatible or unresolvable rules block dispatch and escalate.

Policies do not own cadence, business priority, Scope, execution logic, or Run
status. The fully resolved snapshot and hash are stored on each Run.

Open decisions: Policy identity/revisions, inheritance order, action
vocabulary, exception authority, and exact assurance lattice.

