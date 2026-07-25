# Policy and Controls resolution

Status: **Draft; composition rule approved**

Before dispatch, collect tenant/environment authority, referenced Policies,
Intent Controls, Agent permissions/Constraints, Capability permissions/effects,
Objective Scope, and the requested action.

Resolve in this order:

1. validate every input and revision;
2. intersect available authority and allowed actions;
3. union denies, risky actions, human-required actions, and exclusions;
4. take minimum budgets, duration, and concurrency;
5. take strongest approval and assurance;
6. verify Capability permissions/effects and effective Scope;
7. fail closed on ambiguity or contradiction;
8. store the resolved snapshot and deterministic hash on Run.

Deny always wins. Approval cannot override deny. Intent priority never
overrides governance. Controls cannot loosen reusable Policy. Dispatch must
repeat or transactionally protect the check when authority can change between
approval and execution.

Open decisions: exact lattice, action/effect vocabulary, approval expiry,
policy exception model, and effective Scope representation.

Enforcement belongs in one dispatch service and must be tested with denied,
ambiguous, expired-approval, reduced-budget, and concurrent-policy-change
cases.

Reviewed gap: current direct GitHub dispatch paths do not yet prove this full
resolution before external work begins.
