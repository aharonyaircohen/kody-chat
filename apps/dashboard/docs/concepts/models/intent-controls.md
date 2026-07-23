# Intent Controls

Status: **Draft** · Kind: **Value**

Intent Controls are Intent-specific hard limits applied after reusable Policies.
They may only preserve or tighten effective governance; they can never widen
allow lists, budgets, concurrency, Scope, or approval authority.

When multiple Intents contribute:

- allow lists use intersection;
- deny lists use union;
- budgets and concurrency use the minimum;
- human-required actions use union;
- assurance and approval use the strongest requirement;
- conflicts fail closed and require resolution or escalation.

Intent priority can choose attention among already permitted work, but never
overrides Policy or Controls. Cadence belongs to a Loop Trigger.

The current `IntentDefinition` embeds `policy`, `constraints`, and
`deliveryPolicy`. Migration must classify each field as reusable Policy,
Intent Control, Trigger, or product projection before changing persistence.

Open decisions: exact target schema, whether Controls are revisioned separately,
and which delivery fields survive after cadence removal.

