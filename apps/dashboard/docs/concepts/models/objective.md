# Objective

Status: **Draft** · Kind: **Value**

An Objective defines a desired state, the Evidence required to prove it, and
the Scope in which it applies.

```ts
interface Objective {
  desiredState: string;
  requiredEvidence: string[];
  scope: Scope;
}
```

Goals and Loops own Objectives. An Objective has no independent identity,
Lifecycle, schedule, execution reference, or progress. `desiredState` must be
observable; `requiredEvidence` names proof contracts rather than work steps;
Scope narrows evaluation. Empty or circular Evidence requirements are invalid.

A Goal completes only when current, attributable Evidence satisfies its
Objective. A Loop uses the Objective to evaluate ongoing health and determine
whether action is needed.

Open decisions: Evidence contract vocabulary, evaluator ownership, freshness
windows, partial satisfaction, and human override rules.

Agent rules: do not write activities as desired states; do not lower Evidence
requirements after execution; do not treat progress or Run success as proof.

Recommended decision: require at least one named Evidence contract for active
Goals and Loops, with evaluator, freshness, and Scope recorded.
