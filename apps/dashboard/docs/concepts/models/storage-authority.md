# Storage authority and tenant Scope

Status: **Draft; runtime rule canonical**

Convex is the sole authority for Dashboard runtime State and History. Runtime
State must never read from, write to, bootstrap from, dual-write to, or fall
back to GitHub.

| Data | Authority |
| --- | --- |
| Active State, Runs, events, approvals, outputs | Convex |
| Current definition heads/revisions | selected agency definition store; consolidation required |
| Repository content and Engine definitions | GitHub/repository |
| Store assets and distributable packages | Kody Store |
| UI projections and caches | derived, rebuildable |
| Optional GitHub CMS content | only explicit selected CMS adapter |

Every authoritative record carries tenant identity. Server authorization derives
tenant/user Scope; client-supplied tenant identifiers are never trusted alone.
Portable exports omit runtime State, credentials, secrets, and tenant-local
bindings unless explicitly included by a governed format.

Current repository/file compatibility paths must be inventoried per model.
Migration is incomplete while any runtime fallback or dual-write remains.

