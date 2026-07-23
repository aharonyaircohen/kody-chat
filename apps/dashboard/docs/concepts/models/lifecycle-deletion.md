# Lifecycle and deletion

Status: **Draft**

The current shared Lifecycle is `draft → active ↔ paused → retired → archived`,
with reactivation paths currently allowed by the domain validator. This is
implemented code, not yet an approved lifecycle for every model.

Model-specific meaning:

- draft: incomplete or not executable;
- active: eligible for use;
- paused: temporarily prevents new activity;
- retired: unavailable for new dependencies or dispatch;
- archived: hidden from normal views and retained for history.

Deletion is not a Lifecycle state. Before destructive deletion, enumerate
incoming ownership/dependency references, active Runs, historical pins, audit
requirements, and external assets. Prefer retire/archive. Definition revision
and History retention must survive head retirement.

State transitions require actor, reason, timestamp, optimistic concurrency, and
audit provenance. Pausing a parent does not silently cancel active child Runs.

Open decisions: per-model transitions, restore rules, hard-delete eligibility,
retention, cascades, and active-Run behavior.

Agent rule: product labels are projections until mapped here. Delete commands
must enumerate incoming references and History before mutation.

Recommended decision: retire then archive; allow hard deletion only for
unreferenced Drafts after retention checks.
