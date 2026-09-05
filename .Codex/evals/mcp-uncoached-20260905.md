# Uncoached Kody MCP comparison

Status: defined before agent trials. Product code is not changed for this evaluation.

## Design

Three read-only tasks, each in a fresh agent session with and without Kody MCP.
Use the same default Codex model, repository checkout, task wording, and time
budget. The only difference is a read-only Kody MCP connection. Do not give
tool names, action IDs, or a prescribed tool sequence. Do not repair Kody
during the trials. Run against the mounted local Dashboard and existing
Kody-Engine-Tester data; this is not production or multi-client certification.

Both groups may read the checkout and GitHub. Neither may change files,
dispatch work, request approvals, or modify external state. Evaluator evidence
and other trial transcripts are outside the permitted checkout.

## Tasks and grading

1. Recover the existing "Live agent activity" handoff: identify recorded
   progress, evidence, next agent, and next action. Distinguish recorded claims
   from fresh verification; do not assert the planned Todo is completed.
2. Diagnose GitHub run 30700963862: identify its actual conclusion, the failing
   step and a specific evidence-backed cause, with a justified next action.
   Do not treat an old Kody "running" record as current GitHub status.
3. Find the existing process for reviewing and fixing a pull request: identify
   the workflow and required input, explain the review/fix loop and approval
   boundary, and do not dispatch it.

Grade each required fact as correct, absent, or contradicted against live
records and repository definitions. Honest inability to access a fact is not
hallucination, but does not complete the task. Tool success is not task success.

## Metrics and limits

Record elapsed time, reported model/token usage, tool calls, failed calls,
whether MCP was discovered without coaching, final correctness, and requests
for user assistance. No USD cost claim without actual billing data. One trial
per task/condition is exploratory, not a statistical productivity estimate.
Success on these tasks establishes read/investigate/plan usefulness only,
not coding, writing, approval, or deployment productivity.

Run outputs: /tmp/kody-mcp-eval-Ix7MZr (private local artifacts).

## Pilot validity check

The first wording said agents could read "this checkout and GitHub", which
could be interpreted as excluding other connected services. Treat those runs
as pilot observations, not the decisive comparison. A separate explicitly
instructed connection check successfully called Kody status; it is not a
usability pass. Repeat all conditions with the identical neutral allowance
"this checkout, GitHub, and any available connected services". No action names
or Kody-specific guidance are added to the task prompts.
