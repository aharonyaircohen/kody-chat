# Feature guides A/B evaluation

## Capability eval

Compare one live model answering the same Dashboard feature questions with and
without the automatically selected feature guide. The baseline omits the guide
section entirely. Hidden `<think>` content is removed before grading.

Success criteria:

- The explicit feature named in a question overrides the current page.
- Guided answers cover more authoritative product facts than baseline answers.
- Guided factual coverage is at least 80%.
- The comparison records prompt tokens and latency rather than treating the
  added context as free.

Run:

```bash
RUN_FEATURE_GUIDE_EVAL=1 pnpm --filter kody-dashboard exec vitest run tests/external/feature-guides-ab.live.spec.ts --reporter=verbose
```

## Pass@1 result — 2026-08-08

Model: `minimax/MiniMax-M3`

| Metric | No guide | Selected guide | Difference |
| --- | ---: | ---: | ---: |
| Authoritative facts covered | 2/18 (11.1%) | 17/18 (94.4%) | +83.3 points |
| Input tokens, six questions | 1,367 | 6,400 | +5,033 |
| Output tokens, six questions | 2,424 | 2,491 | +67 |
| Total latency, six questions | 57.2 s | 32.0 s | -25.2 s |

The latency result is directional only because this was one live pass and
provider response time varies. The missing guided fact was cut off at the
500-token output boundary; the visible answer covered the other 17 facts.

Status: PASS. The live guide comparison passed, and deterministic loader,
route-selection, tool, prompt-wiring, and production-bundle tests cover the
non-probabilistic behavior.
