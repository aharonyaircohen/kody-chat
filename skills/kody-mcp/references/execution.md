# Execution, approvals and automation

Use this procedure when the user's task calls for Kody to run or resume work, or manage automation. Discover the live actions and schemas first; the examples below describe roles rather than a guaranteed catalog.

## Prepare the request

Read the target workflow, capability or automation definition and its required inputs, effects and relevant policy. Confirm the repository, intended outcome and user authorization. Do not choose a similarly named definition without checking its contents.

Find or create the relevant durable work record when the action requires a `workRecordId`. Reuse the task's existing Todo work record. Link the objective and intended result so subsequent agents can understand the request. Follow the common write rules in SKILL.md.

## Request and follow the actual state

1. Submit the discovered request action with validated inputs and a stable key for the logical operation.
2. Inspect its response. Creating an approval request is not launching a run. Present any required approval using the returned URL or supported approval surface; never fabricate approval or allow an agent to approve its own request through a workaround.
3. Track the returned approval/run identifiers through the available read actions. Poll at a bounded cadence appropriate to the operation, respecting server guidance. Avoid repeated submissions while awaiting a decision or a run outcome.
4. If the request becomes rejected, expired, cancelled, failed or otherwise blocked, report that state and the reason. A new request requires reassessing current state and existing authorization; do not resubmit automatically merely to obtain a different result.
5. For resume, read the current run and waiting condition first. Use the supported resume path for that run rather than starting a duplicate execution.

If the action supplies only an approval ID, use the service's supported linkage to discover the eventual run; do not assume one already exists. If linkage or tracking is unavailable, state that limitation and leave a checkpoint with the identifiers obtained.

## Verify the outcome

Read the final run state, relevant artifacts and durable work result. Check the user-requested outcome at its actual boundary: a saved record can be reread, a code result has a diff and test evidence, a deployment has a candidate and live checks. Do not infer success from a queued request or green status alone.

Record outcome, evidence, remaining work and returned identifiers in the existing task record. If execution outlasts this session, checkpoint the current state and how to resume observation; do not promise future monitoring without an authorized, configured mechanism.

## Schedules and triggers

Read the existing definition before changing it; update the intended one instead of creating a duplicate. Resolve timing, timezone, event filters, inputs and target behavior using the live contract and user request. Clarify missing schedule details when they affect when or what will run.

After approval/application, reread the saved definition and effective enabled state. Saving a schedule or trigger proves configuration only. Verify an actual occurrence and its result when feasible; otherwise explicitly mark execution unverified. Do not manually trigger externally visible work just to test a schedule without authorization for that action.

Deleting or disabling automation must target the identified definition within user authorization. Keep configuration, approval state, execution state and evidence distinct in the final report.
