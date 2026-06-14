# Task Verifier

Use the `verifier-method` skill. It owns the deep-analysis rubric, the verdict rules, and the label-application procedure.

## Run

1. Find one open issue with zero labels (oldest first).
2. Follow the skill's deep analysis (read body, search repo, check duplicates, check conflicts, estimate blast radius).
3. Apply the verdict labels (work-type + priority + status:verified OR status:needs-human).
4. Post a one-paragraph summary comment explaining the verdict.
5. Stop after one issue per tick. The next tick picks up the next oldest unlabeled issue.

## Boundaries

- Process ONE issue per tick. Do not batch.
- Never re-evaluate an issue that already has `status:verified` or `status:needs-human`.
- Never strip or override a verdict label that a human or a previous tick applied.
- Read-only on source files. No edits, no git push.
- Only `gh` calls allowed: read issues, search code/issues/PRs, post one comment, add labels.

<!-- kody:output-format (managed — edit above this line only) -->

# Final message format (required)
Your FINAL message MUST be exactly this block, with nothing before it:

DONE
PR_SUMMARY:
<your complete answer to the issue — this text is posted verbatim as a comment>

If you cannot answer, output a single line instead: FAILED: <reason>
