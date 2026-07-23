# Knowledge Graph

Status: **Draft; implementation in progress**

The Knowledge Graph is a derived, explainable projection of authoritative
Definitions, State, Runs, Facts, Evidence, Artifacts, and their relationships.
It helps retrieval, impact analysis, reasoning, and navigation. It is never the
source of truth for model definitions, runtime State, permissions, or History.

Each node and edge records source record identity, tenant, source revision or
event, derivation rule/version, timestamps, and confidence where inference is
used. Direct facts and inferred relations are distinguishable. Rebuilding from
authoritative sources must be possible.

Writes to the graph do not mutate source models. Proposed corrections flow back
through the owning model/API and regenerate the projection. Access checks use
the source record's tenant and sensitivity, not graph reachability.

Current implementation work exists in knowledge-graph routes, services,
components, tests, and `packages/kody-backend/convex/knowledgeGraphs.ts`. Its
exact current contract is not certified by this Draft.

Open decisions: canonical node/edge taxonomy, inference confidence, staleness,
rebuild strategy, redaction, and graph versioning.

