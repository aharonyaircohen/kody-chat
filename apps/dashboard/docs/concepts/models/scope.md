# Scope

Status: **Draft** · Kind: **Value**

Scope defines included and excluded members across named dimensions.

```ts
interface Scope {
  include: Record<string, string[]>;
  exclude: Record<string, string[]>;
}
```

Exclusion always wins. Combining authorities may only narrow Scope: includes
intersect where both specify a dimension, while excludes union. An absent
dimension must not silently mean global access; its default is an explicit
Policy decision.

Scope is a value embedded in Intent and Objective. Runtime dispatch resolves
tenant, user, repository, environment, resource, and data boundaries into the
effective Scope recorded or hash-linked on the Run.

Scope is not permission: an action must pass both Scope and authority checks.

Open decisions: dimension registry, wildcard semantics, empty-include meaning,
resource resolution, and how the effective Scope is stored on Run.

