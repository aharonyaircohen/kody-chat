# AI Agency model

This is the source of truth for where AI Agency concepts belong.

The short rule:

```text
Intent = why
Operation = delegated responsibility
Goal = what
Loop = when
Agent = who
Capability = how
Workflow = composed how
Context = background facts
Instructions = chat behavior
State = what happened
```

Agency Director is a responsibility, not a new agency model:

```text
Agency Director = COO identity + management capability + management loop
```

If a new agency file mixes two rows, stop and split it before adding more
behavior.

Operation is the target management model. It is not implemented in the current
storage or runtime yet; current Intent files still link directly to goals,
loops, and capabilities. Documenting the boundary first prevents the future
implementation from becoming another overlapping container.

## Intent-led company growth

The AI agency should grow from intent, not from available automation.

Core rule:

```text
Every durable agency object should trace back to an intent.
Not every intent should create durable agency structure.
```

Use intents as human direction. An Agent running a management Capability
interprets them and creates the smallest useful structure only when the need is
stable:

| Step       | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| Intent     | Human says what Kody should care about                         |
| Operation  | Reused or proposed only for a stable delegated responsibility  |
| Goal       | Created only for a concrete outcome that should become true    |
| Loop       | Created only for recurring attention                           |
| Capability | Reused when possible; added only when no existing ability fits |
| Link back  | Operations and their work must trace to the intents they serve |

The managing Agent should prefer a note over new structure when the intent is
vague, temporary, already covered, or too small to justify durable machinery.

Intent has two text levels:

```text
for = short one-line direction shown in lists
description = optional deeper context, constraints, examples, and what good looks like
```

The description helps the managing Agent interpret the intent. It must not
become a second intent, a behavior selector, or an execution route.

### Intent responsibility questions

An intent is complete only when it gives clear answers to these questions:

1. What outcome does the company want?
2. Why does it matter?
3. What has priority?
4. What principles must be followed?
5. How will success be measured?
6. What hard rules must no operation violate?

These questions define the responsibility boundary for Intent. They describe
company direction and non-negotiable constraints, not the operating structure
or execution plan used to carry them out.

## Operation as the responsibility boundary

An Operation is a durable operating unit with one bounded responsibility. It is
the context, ownership, and reporting boundary used when managing several Goals
and Loops together. Users author and approve Intents. Existing Agents manage
Operations through Capabilities and Loops.

The Agency Director is not another agency model:

```text
Agent = who makes the decision (COO)
Capability = what management action it can perform
Loop = when that management action wakes
Operation = the durable responsibility being managed
```

In the current agency configuration, the Agency Director is represented by:

- `coo` as the identity;
- `agency-portfolio-management` and `agency-operations-management` as management capabilities;
- `agency-evolution-loop` as the recurring management loop.

The Director reviews active Intents and Operations, chooses `NOOP`, `PROPOSE`,
`DISPATCH`, `PAUSE`, or `ESCALATE`, and leaves execution to the linked
Operations and their existing Goals, Loops, Workflows, and Capabilities.

Intent and Operation have different lifetimes:

```text
Intent = direction that may change priorities or constraints
Operation = delegated responsibility that remains while the responsibility exists
```

An Intent may reshape one or more existing Operations. An Operation may serve
more than one Intent over time. Intent influences Operation; it does not own the
Operation's lifecycle.

An Operation owns only the minimum structure needed to define that boundary:

- Its responsibility and what it does not own.
- The Intents that justify it.
- Its Goals and Loops.
- Whether it is proposed, provisioning, active, paused, or retired.
- Health derived from its Goals, Loops, and runtime evidence.

The first implementation stays flat and simple:

- Every Goal and Loop has one accountable Operation.
- There are no child Operations or separate Manager model.
- Agents, Workflows, Capabilities, Context, and run lanes remain shared.
- Operations do not copy lists of shared assets. Their use is derived through
  the Goals and Loops they own.
- Intent policy remains the source of authority and safety rules.
- Detailed execution stays in Jobs, Runs, and State. Evidence rolls upward.

## Operation creation and readiness checklist

A management run may draft an Operation before all of its required pieces
exist. The draft describes the needed responsibility; provisioning then reuses,
connects, or creates the minimum missing Goals and Loops.

The checklist is a validation contract, not a task list stored inside every
Operation. The Operation stores the actual answers and links. AI Agency Doctor
uses this checklist to decide whether it may advance through this lifecycle:

```text
proposed -> provisioning -> active
```

Before proposing a new Operation, the managing Agent must check whether the
existing agency structure already satisfies the Intent. Not every Intent needs
a new Operation.

### Proposal readiness

- At least one active Intent provides evidence that the responsibility is
  needed.
- A new Operation is genuinely needed.
- Its responsibility is clear and bounded.
- What it explicitly does not own is clear.
- Its intended Goals, Loops, and success measures are clear.

### Provisioning readiness

- Existing Goals and Loops were checked for reuse before creating new structure.
- Missing Goals and Loops have a creation plan.
- Linked Intent policy and approval rules are respected.
- Important unknowns are resolved or explicitly marked as blockers.

### Activation readiness

- Every required piece exists and is connected.
- Every Goal and Loop has only one Operation owner.
- Required human approvals are recorded.
- Health can be derived from connected work and runtime evidence.

An Operation must not become active until activation readiness passes. A
management run must attach evidence to important claims and mark missing
information as unknown instead of inventing it.

### Persisted contract and runtime gate

Each Operation is stored once at:

```text
operations/<id>/operation.json
```

The authenticated Dashboard API exposes list/create, read/update/delete, and
run endpoints under `/api/kody/operations`. Every mutation verifies the GitHub
actor and writes through the configured backend with the current file SHA.

Activation and run both reject an Operation when:

- A linked Intent is missing or not active.
- It owns no Goal or Loop.
- A referenced Goal or Loop does not exist as the expected model.
- Another Operation already owns the same Goal or Loop.

The run endpoint dispatches `agency-operations-management` with the selected
Operation path. That Capability must reload the persisted contract and refuse
to act outside its listed Goals and Loops or across its `doesNotOwn` boundary.

## Canonical terms

Use these terms when explaining the agency model to humans or coding agents:

| Concept    | Simple meaning                      | Owns                                                                                          | Must not own                                                      |
| ---------- | ----------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Intent     | Why the company should change       | Company outcome, reason, priority, principles, success measures, and hard constraints         | Operating portfolio, runtime limits, or execution steps           |
| Operation  | Where responsibility is grouped     | Bounded responsibility, Intent links, owned Goals and Loops, lifecycle, and derived health    | Agent identity, shared asset definitions, policy, or execution    |
| Goal       | What should become true             | The result to reach, evidence, current progress, blockers                                     | Detailed worker identity or low-level method                      |
| Loop       | When to check                       | Cadence, heartbeat, and which goal, workflow, or capability to wake                           | The detailed implementation of each capability                    |
| Agent      | Who is acting                       | Identity, judgment style, values, role voice                                                  | A job, schedule, tool recipe, or output contract                  |
| Capability | How the agency can produce a result | A reusable ability, its kind, inputs, outputs, tools/data/instructions, and execution binding | Agency direction, long-term progress, or agent identity           |
| Workflow   | How capabilities are chained        | Ordered capability steps for one run, shared step results, final output                       | Agency direction, long-term progress, schedule, or agent identity |

Capability kinds:

```text
Observe = inspect state and return facts
Act = change something or trigger work
Verify = confirm pass/fail evidence
```

## Storage names

The public model has no separate "implementation" concept. Capability is the
operator-facing concept. Some files and config keys still say `implementation` for
compatibility; read that as "capability implementation", not as a new model.

```text
Capability = contract + implementation
```

## Ownership rules

This table is kept only to make the storage split explicit:

| Storage name   | Owns                                                                                                            | Must not own                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Capability     | Capability contract: public action name, kind, owner, cadence, safety, inputs, outputs, and implementation link | Long identity prompt or low-level implementation                   |
| Workflow       | Ordered capability steps for one run                                                                            | Business progress, schedule, identity, or implementation internals |
| Implementation | Prompt glue, skills, scripts, tools, landing, output contract                                                   | Agency direction, cadence, public ownership, or long-term progress |
| Context        | Facts Kody should know while reasoning                                                                          | Source-of-truth policy or scheduled work                           |
| Instructions   | Chat response behavior such as tone, length, and format                                                         | Agency facts or agency structure                                   |
| State          | Runtime facts: last run, pending work, outcome, logs                                                            | Authoring rules or portable agency doctrine                        |

## Where rules live

Use three layers:

| Layer   | Purpose                                                 |
| ------- | ------------------------------------------------------- |
| Docs    | Source of truth for the model                           |
| Context | Short reminders that Kody should see during normal work |
| Doctor  | Checks that the files follow the model                  |

Do not hide the model only in Context. Context is easy for Kody to read, but docs
are where humans and agents should find the durable contract.

Good Context reminder:

```text
Follow docs/concepts/company-model.md.
Use Intent/Operation/Goal/Loop/Agent/Capability/Workflow as the agency model.
Treat `implementation` as an old storage/config word for capability implementation.
```

## Dependency graph

The AI Agency Map should be a real dependency graph, not just a visual chart.

Nodes:

```text
agent
capability
workflow
implementation
goal
loop
intent
operation
context
command
tool
report
```

Edges:

| Edge                               | Meaning                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| intent -serves-through-> operation | This direction is served by this operating unit             |
| operation -owns-> goal/loop        | This operating unit is accountable for this stateful work   |
| goal -> capability/workflow        | This result depends on this reusable execution path         |
| loop -> goal/workflow/capability   | This heartbeat may wake this target                         |
| workflow -> capability             | This run chains these capability steps                      |
| capability -> agent                | This capability runs as this identity                       |
| capability -> capability           | This capability is currently stored as this contract folder |
| capability -> implementation       | This capability uses this implementation                    |
| implementation -> tool             | This implementation needs this tool                         |
| capability -> report/context       | This capability reads or writes this artifact               |

During migration, direct `intent -> goal/loop` edges are compatibility links
that identify work not yet assigned to an Operation; they are not a second
target model.

The graph should answer:

```text
What uses this?
What breaks if this is removed?
What is active?
What is missing?
What is local vs Store-backed?
```

The graph is generated from agency files and config. It is not the source of
truth.

## AI Agency Doctor

AI Agency Doctor is the checker for the graph.

It should run in two ways:

```text
Manual: user clicks/checks now
Scheduled: a loop checks regularly
```

At first, Doctor should report instead of fixing automatically.

Checks:

```text
missing agent
missing implementation
missing goal capability
missing Operation responsibility or Intent link
Goal or Loop owned by more than one Operation
active Operation with unresolved required pieces
Operation health cannot be derived
inactive item used by an active goal
duplicate capabilities
too much work in one loop
agent contains job instructions
capability contract contains implementation runbook
```

## Run lanes

A run lane is a separate work lane with its own safety rules.

Do not put all agency work in one pile.

Examples:

| Lane     | Kind of work                    | Typical rule                          |
| -------- | ------------------------------- | ------------------------------------- |
| CI       | Keep checks green               | Can run often                         |
| PR       | Keep pull requests moving       | Avoid duplicate comments/work         |
| Release  | Prepare and ship releases       | Run carefully, require clear evidence |
| QA       | Browser or product verification | Needs auth/session readiness          |
| Docs     | Keep docs accurate              | Lower urgency                         |
| Security | Sensitive review                | Slower and stricter                   |

Lanes give scale without making one giant queue. More lanes can run safely when
their work does not touch the same thing.

A run lane is not an Operation. Operation is a business responsibility and
management boundary; a lane is runtime isolation, concurrency, and safety. One
Operation may use several lanes, and one lane may safely serve several
Operations.

## Naming rule

Prefer clearer ownership over new concepts.

Before adding a new model, ask:

```text
Is this actually an agent, capability, workflow, goal, loop, operation, intent,
context, instruction, or state?
```

If yes, use the existing concept. If no, write the new ownership rule here first.
