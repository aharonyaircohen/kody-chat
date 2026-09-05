# Kody MCP: uncoached agent comparison

## Verdict

Agents can discover Kody and follow its discovery sequence without being told
tool names. This experiment did not establish a productivity benefit. In the
decisive comparison, every attempt to execute a Kody read action was blocked by
the client's approval policy, even though the token was read-only. Kody did
not produce a completed handoff or a verified current workflow recommendation.

This is a client-policy compatibility and usability finding, not evidence that
the backend cannot read its data or that all coding agents behave the same way.

## Method

- Date: September 5, 2026.
- Installed Codex CLI, fresh ephemeral sessions, unchanged model defaults.
- Same read-only sandbox, repository, task wording, and 180-second cap in both
  conditions. Only the treatment condition has a Kody connection.
- Existing GitHub connector available to both groups. Shell-based GitHub
  access was restricted in the sandbox; agents used the shared connector.
- Source checkout: `aharonyaircohen/Kody-Engine-Tester`, commit
  `b4d862d7256085e33896e328f0994288bf27c7cb`.
- Kody endpoint: mounted local Dashboard at `http://127.0.0.1:3333/api/kody/mcp`,
  using real persisted tester-repository data, not mocked tool results.
- Six initial pilot sessions, one separate instructed connection check, and
  six decisive sessions: 13 completed sessions, no timeouts.
- The pilot's source allowance could be interpreted as excluding connected
  services. It was not used for the decisive productivity comparison. The
  revised prompt explicitly allowed all available connected services, without
  naming Kody, actions, schemas, or an intended tool sequence.
- No follow-up coaching or human intervention was supplied during a trial.

## Decisive results

| Task | Without Kody | With Kody | Assessment |
| --- | --- | --- | --- |
| Recover existing handoff | 128.6s; 29 tool calls; could not find it | 66.3s; 14 calls; found Kody work tools, but read blocked | Neither completed. Earlier failure is not a productivity gain. |
| Diagnose failed run | 100.4s; 16 calls; useful GitHub-based diagnosis | 114.8s; 28 calls; similar GitHub-based diagnosis after blocked Kody reads | No demonstrated answer improvement; more calls and time in this pair. |
| Find PR review/fix process | 85.4s; 25 calls; repository-based partial answer | 99.3s; 29 calls; partial answer, live workflow read blocked | Neither verified the current standalone workflow and complete inputs. |

The diagnosis answers correctly identified engine exit 99 and the review /
revision cycle. Both distinguished likely loop exhaustion from a confirmed
root cause. The deepest cause remained unverified; neither is a complete
root-cause investigation. The evaluator independently verified GitHub's
failed conclusion, job/step, and the terminal log sequence.

All three treatment agents independently discovered Kody. Together they made
24 Kody tool calls. All four execution attempts were blocked before backend
execution: `work.list`, `workflow.get`, `run.get`, and `workflow.list`.
The reported error was:

> MCP tool call requires approval, but approval policy is never

The diagnosis agent also made two detail calls using `toolId` instead of
`actionId`, then corrected them. Its attempted `run.get` used a GitHub run ID,
not Kody's distinct run ID; because execution was blocked, that lookup was not
validated. This illustrates a further identifier-mapping friction, not a
confirmed successful lookup.

## Why it happened

### 1. Safe reads share a tool with changes

The public `kody_execute_tool` advertises `readOnlyHint: false` and
`destructiveHint: true` for every action. Individual action details correctly
describe reads as read-only, but the host's approval check happens at the
public tool boundary. Status/search/details succeeded; actual data reads did
not. This is strong evidence that the combined execution boundary is unsuitable
for this noninteractive read-only client configuration.

Do not solve this by disabling client protection or marking every execution
safe. Provide a genuinely read-only execution surface whose server-side
validation rejects write actions, while preserving approval controls for
changes.

### 2. Ordinary wording gives empty search results

Observed empty searches included `tasks search`, `review pull request fix
workflow`, and `workflow run inspect execution logs`. The search implementation
matches a complete phrase against catalog metadata. Agents recovered by using
broader words or listing the catalog, but that required extra attempts.
The pilot also showed empty results for `review` even though a review/fix
workflow exists: catalog-action search does not search installed resources.

Improve task-oriented descriptions, word-based matching, and a clear fallback
that tells agents how to find resource names. Do not imply action search also
searches workflow contents.

### 3. Data availability alone does not ensure reliable answers

Evaluator reads confirmed the existing handoff contains a named next agent
(OpenCode), evidence (`live:activity-agents`), and a next action (inspect the
Activity timeline). Neither decisive agent recovered these facts.

Evaluator reads also found a stale Kody `running` record for the documentation
run that GitHub marks failed. Agents did not consume it because reads were
blocked. This is an independently observed data-freshness risk, not an observed
agent error. The default run list contained 116,110 JSON characters for 20
records; the workflow list contained 25,197. Compact summaries with deliberate
detail retrieval would reduce avoidable context overhead.

## Usage, not monetary cost

CLI token counts are cumulative across turns and include repeated cached
context. They are not the size of one prompt. Billing cost was not measured.

| Task/condition | Input tokens | Cached input | Output tokens |
| --- | ---: | ---: | ---: |
| Handoff, without | 1,008,372 | 919,168 | 2,357 |
| Handoff, with | 384,081 | 332,544 | 1,067 |
| Failure, without | 464,070 | 400,768 | 1,826 |
| Failure, with | 663,059 | 603,264 | 1,935 |
| Workflow, without | 361,214 | 320,128 | 1,982 |
| Workflow, with | 450,022 | 411,904 | 1,826 |

No statistical speed/cost conclusion is justified by one decisive trial per
condition. The handoff result needs access/help in both conditions; workflow
answers leave the current registry unverified; diagnosis needs deeper evidence
for a conclusive root cause. Zero live human interventions is not equivalent
to zero assistance needed.

## Recommendation and limits

Keep the concept. First make genuine reads usable under ordinary read-only
client policy, improve discovery, and repeat these unchanged tasks. Only after
that measure actual coding, write, approval, and deployment tasks, repeat across
multiple clients/models, and compare verified completion—not just time to stop.

This experiment does not prove a general productivity increase, compatibility
with every client, or production behavior. It establishes uncoached discovery
and exposes concrete obstacles in one real client configuration.

Verification: evaluation scripts passed syntax checks; all 13 agent sessions
completed; live local MCP connection confirmed; all evaluator-created tokens
revoked; cloned checkout remained clean. No MCP product code was changed and
no workflow was dispatched. Product typecheck/lint, browser UI, and deployed
live verification were not run for this read-only evaluation.

## Evidence

- Plan: `.Codex/evals/mcp-uncoached-20260905.md`.
- Private local raw JSONL transcripts, metrics, evaluator snapshot, scripts,
  and extracted results: `/tmp/kody-mcp-eval-Ix7MZr/`.
- Decisive metrics: `/tmp/kody-mcp-eval-Ix7MZr/round2-metrics.json`.
- Extracted tool calls and complete answers:
  `/tmp/kody-mcp-eval-Ix7MZr/summary.json`.
- Failed run: https://github.com/aharonyaircohen/Kody-Engine-Tester/actions/runs/30700963862
- Job logs: https://github.com/aharonyaircohen/Kody-Engine-Tester/actions/runs/30700963862/job/91371787573
- Source of shared execution annotations and catalog search:
  `packages/kody-chat-dashboard/app/api/kody/mcp/route.ts`.
