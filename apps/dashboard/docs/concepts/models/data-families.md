# Definition, State, and History

Status: **Draft**

Every stored field belongs to exactly one family.

| Family     | Meaning                                    | Mutation                                 |
| ---------- | ------------------------------------------ | ---------------------------------------- |
| Definition | what a model means and is configured to do | immutable revision; new revision on edit |
| State      | current mutable operational condition      | authoritative transactional update       |
| History    | what occurred and what was produced        | append-only; terminal records immutable  |
| Projection | derived view for reading or UI             | rebuildable; never authoritative         |

Definitions contain stable IDs and semantic configuration, not timestamps or
persistence metadata. State references a definition ID and may include
Lifecycle, progress, health, or eligibility. History includes Runs, events,
outputs, approvals, and audit records.

Definitions may reference shared definitions. State may reference its
definition and active execution identifiers. History pins revisions. A
projection may join all families but cannot be written back as authority.

When a combined legacy record exists, migration classifies each field, writes
the authoritative family, changes all readers, then removes fallback and
dual-write.

Agent rule: if a field cannot be assigned to one family and authority, stop
before adding it. Timestamps and persistence IDs belong to envelopes, not
semantic definitions.

Reviewed gap: managed Goal, Operation, Capability, Agent, Workflow, and Run
product shapes still combine multiple families.
