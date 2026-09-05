# Generic MCP read access and discovery

## Change and boundary

The shared action catalog remains the sole owner of action permissions and
execution. An additive `kody_read_tool` uses the same input validation,
repository authorization, service implementations, rate limit, and audit path.
Its execution guard requires all three: read permission, no side effects, and
no required approval. Write-capable tokens cannot bypass this guard.
`kody_execute_tool` remains compatible and conservatively marked potentially
destructive. No client permission policy was disabled or relaxed.

Discovery now ranks matching words from action IDs, titles, categories, and
summaries. Exact IDs rank first; repeated words do not increase the score;
ties and pagination are deterministic. It is keyword discovery, not semantic
search. Responses provide the appropriate call tool, available categories,
and instructions for inspecting resources through their list/get actions.
Status reports the actual token grants. No agent-name or task-specific rules,
second action registry, extra storage, or service layer were added.

Security and test-first skill guidance influenced the fail-closed execution
guard and regression coverage. New tests failed against the original code
before implementation. Evaluation uses the pre-existing fixed prompts and
success criteria, without coaching or changing approval settings.

## Verification

- Regression: 39 changed-boundary unit/integration tests passed, plus 25
  existing host MCP work/approval/release/helper tests. Includes all mutating catalog
  actions rejected through the read facade, read-token success, missing read
  scope rejection, input validation, metadata consistency, ranked search,
  category filtering, pagination, and legacy compatibility.
- Coverage: 85.01% statements / 85.93% lines across the route and catalog;
  77.90% branches / 72.91% functions. This is not an all-metrics 80% claim.
- Typecheck: root check passed; focused package check also passed.
- Lint: root check passed with warnings; focused check has one existing
  `no-explicit-any` warning at catalog line 794 and zero errors.
- Live local API: `node apps/dashboard/scripts/verify-public-mcp.mjs` passed
  against the mounted app and real tester-repository backend. Verified facade
  discovery, read-only hints, actual read, server-side write rejection, and
  legacy execution. Temporary test tokens were revoked.
- Root `pnpm verify`: failed at dashboard tests, so its build stage was not
  reached. First run: 11 failed / 3238 passed / 9 skipped. A later dashboard
  rerun during concurrent workspace edits: 15 failed / 3239 passed / 9 skipped.
  Failures concern Brain status, agency requests, browser-gate configuration,
  Store defaults, OrgManager validation, preview-builder naming, email login,
  and chat registries—not the MCP regression tests. These were not changed
  as part of this task. Do not describe the full repository gate as green.
- Production build: passed through `pnpm --filter kody-dashboard test:e2e:gate`
  (one existing dynamic-file tracing warning).
- Mocked/browser gate: failed, 137 passed / 2 failed in 5.5 minutes. The
  `/activity` and `/triggers` render-smoke checks recorded the same browser
  Performance error: `KodyTaskPage cannot have a negative time stamp`.
  Do not suppress the console check or treat this gate as green. The gate
  reuses an existing local server, so its successful build does not prove the
  browser portion used a freshly started production server.
- Deployed live test: not run; this is local evidence, not production proof.

## Fixed-prompt agent rerun

Same six fresh ephemeral Codex sessions as the prior decisive comparison:
three matched tasks, read-only sandbox, unchanged defaults and task prompts,
180-second limit, GitHub connector available to both conditions. Only the
treatment has Kody connected. Real persisted data, no mocked MCP responses.

All six sessions completed without timeouts. All three treatment agents
discovered Kody without coaching and read the real data successfully: 19 Kody
calls, including six `kody_read_tool` calls, with no Kody call errors.

| Task | Without Kody | With Kody | Outcome |
| --- | --- | --- | --- |
| Recover handoff | 147.6s; 29 calls; could not find it | 51.7s; 10 calls | Kody agent recovered recorded progress, evidence, OpenCode handoff, and the next step. Correctly distinguished planned status from the recorded completion claim. |
| Diagnose failed run | 107.7s; 16 calls | 138.1s; 23 calls | Both identified engine exit 99 and review/revision cycles. Kody additionally exposed stale running records. Neither conclusively established the engine's stopping cause. Extra context cost time. |
| Find review/fix workflow | 99.5s; 26 calls; repository-based partial answer | 64.0s; 12 calls | Kody agent verified live `review-fix`, required `pr`, optional `previewUrl`, review/UI-review/fix transitions, five-iteration limit, and approval requirement. No dispatch. |

The previous treatment could not execute any of its four attempted reads.
The rerun completed the handoff and workflow-selection tasks that were
previously blocked. This supports a concrete benefit for shared context and
finding existing processes. It does not show that Kody always saves time:
the diagnosis treatment was slower and still lacked a conclusive root cause.

Search regression tests prove improved multiword matching; this rerun's agents
chose single-word queries (`work`, `runs`, `workflow`), so it does not isolate
the productivity effect of the ranking change from the read-access change.

Both groups retained the same repository checkout and read-only sandbox.
The evaluator token was revoked after all trials; the checkout remained clean.
No workflows, approvals, or product work records were created by trial agents.

| Task/condition | Input tokens | Cached input | Output tokens |
| --- | ---: | ---: | ---: |
| Handoff, without | 1,174,910 | 1,089,792 | 2,613 |
| Handoff, with | 241,345 | 215,424 | 710 |
| Failure, without | 467,911 | 427,648 | 1,966 |
| Failure, with | 802,172 | 754,688 | 2,218 |
| Workflow, without | 416,086 | 353,024 | 1,790 |
| Workflow, with | 318,373 | 278,144 | 727 |

Token counts are cumulative CLI usage, including repeated cached context;
they are not a billing-cost measurement.

## Evidence locations

- Prior comparison: `mcp-uncoached-20260905-results.md` in this directory.
- Fixed task criteria: `mcp-uncoached-20260905.md` in this directory.
- Private transcripts and metrics: `/tmp/kody-mcp-eval-Ix7MZr/afterfix-*.jsonl`
  and `afterfix-metrics.json`; extracted complete answers in `summary.json`.
- Dashboard test rerun log:
  `/Users/aguy/Library/Application Support/rtk/tee/1788596270_test.log`.
- Browser failure artifacts:
  `apps/dashboard/test-results/pages-render-smoke-Top-lev-841ab-ty-renders-without-crashing-chromium/`
  and `apps/dashboard/test-results/pages-render-smoke-Top-lev-96dba-rs-renders-without-crashing-chromium/`.

## Remaining limits

This does not fix stale run synchronization or large list payloads. It does
not establish productivity for code-writing, approval, or deployment tasks,
or certify every client. One trial per condition is exploratory evidence,
not a statistically reliable speed or cost estimate.
