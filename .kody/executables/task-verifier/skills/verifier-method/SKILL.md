# Verifier Method

## Scope

An issue is in scope if it is `open` AND has ZERO labels. (Untouched, in the backlog.)

Process ONE issue per tick. Sort: oldest first.

## Step 1 — Read the issue

Read the full body and recent comments. Determine:

- **Work type**: bug, feature, enhancement, refactor, chore, or docs.
- **Priority**: P0, P1, P2, or P3. Default to P2 if unclear.

## Step 2 — Deep analysis (in order)

### 2a. Search the repo and GitHub for keywords

Take the key terms from the title and body. Search:
- `gh search issues <keyword>` — look for near-duplicate issues.
- `gh search prs <keyword>` — look for prior work that solved the same problem.
- `grep -r <keyword>` on local `*.md` files — look for existing docs that already cover this.

If a near-duplicate exists (issue or PR with the same intent), the verdict is `needs-human` — the human should decide whether to close as duplicate or proceed.

### 2b. Check the proposed change against the repo

For each file path or feature mentioned in the issue, read the actual file. Check:
- Does the feature already exist (partially or fully)?
- Does the proposed approach conflict with existing patterns?
- Would the change break anything visible (public APIs, exports, etc.)?

### 2c. Estimate blast radius

- How many files would change? (Read the file list if any.)
- How many modules? (Trace imports if needed.)
- Does it touch any of the tripwire paths the task leader uses? (db/, auth/, migrations/, schema/, .github/, Dockerfile, package.json, middleware/) If so, the human should look — verdict is `needs-human`.

## Step 3 — Decide the verdict

### `status:verified` (good to dispatch)

The issue passes ALL of:
- Clear, bounded scope. No missing info or open questions for the human.
- The proposed change does not duplicate existing work.
- The proposed change does not conflict with existing patterns.
- It does NOT touch any tripwire path.
- It is self-contained.

### `status:needs-human` (a human must look)

ANY of:
- The issue asks for something that already exists in the repo.
- A near-duplicate issue or PR exists.
- The scope is unclear, the body is empty, or open questions are present.
- The change touches a tripwire path.
- You are not confident the change is safe to dispatch.

## Step 4 — Apply labels

For verified:
```
gh issue edit <N> --add-label "status:verified,<work-type>,priority:P<X>"
```

For needs-human:
```
gh issue edit <N> --add-label "status:needs-human,<work-type>,priority:P<X>"
```

## Step 5 — Post the verdict comment

A short paragraph (3–5 sentences) explaining:
- What the issue asks for (one sentence).
- What you found in the repo (duplicate? already exists? clean?).
- Why this verdict (one sentence, grounded in evidence).

Use `gh issue comment <N> --body "<paragraph>"`.

## Boundaries

- Process ONE issue per tick.
- Never re-evaluate an already-labeled issue.
- Never strip or override a verdict label.
- Read-only on source files.
- No source edits, no git push.
