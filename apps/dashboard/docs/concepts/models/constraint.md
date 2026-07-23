# Constraint

Status: **Draft** · Kind: **Value**

A Constraint is a named rule that denies actions or requires approval.

```ts
interface Constraint {
  id: string;
  rule: string;
  actions: string[];
  effect: "deny" | "require-approval";
}
```

Constraints are embedded values in the current domain contract. They never
grant authority. Deny wins over allow; approval cannot bypass a deny. Rules
must use a defined, machine-evaluable language before automated enforcement is
trusted. Free text may explain a rule but must not be the only enforcement.

Agent and Intent currently carry Constraints; Runs store resolved Constraints
with effective Policy. Duplicate IDs in one owner are invalid.

Open decisions: whether reusable Constraints remain separate from Policy,
canonical rule language, action vocabulary, precedence, and exception model.

Agent rules: free text explains but does not enforce; approval cannot override
deny; unknown rules block automated execution.

Recommended decision: move reusable governance into Policy and retain embedded
Constraints only for owner-specific tightening.
