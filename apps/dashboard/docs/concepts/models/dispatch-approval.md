# Dispatch and approval

Status: **Draft**

Dispatch is a service boundary, not a domain model.

For each request it:

1. authenticates actor and tenant;
2. resolves origin, target, dependencies, and pinned revisions;
3. resolves Policy, Controls, Constraints, Scope, permissions, and effects;
4. checks idempotency, capacity, Lifecycle, and compatibility;
5. creates or validates an approval request when required;
6. atomically reserves capacity and creates the Run;
7. invokes the selected adapter;
8. appends events/outputs and finalizes the Run.

Approval binds actor, exact action/input or hash, effective Policy hash,
definitions, Scope, expiry, and decision. Any material change invalidates it.
Approval never bypasses deny or unavailable authority.

Duplicate dispatch requests return the same attempt or a defined duplicate
result. Retry creates a linked new attempt, not a rewritten Run.

Open decisions: approval entity schema, expiry/revocation, capacity leases,
idempotency key scope, and transaction boundaries.

Agent rule: no adapter call may occur before authoritative Run creation,
approval validation, and capacity reservation. Goal, Loop, Workflow, and
Capability must use this same boundary.

Reviewed gap: Goal and Loop manual routes currently dispatch GitHub Actions
directly.
