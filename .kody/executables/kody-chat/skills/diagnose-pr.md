Triggers: "diagnose PR #N", "what did kody miss", "audit the kody fix", "why didn't kody solve this". Use the **deep question shape from the persona's hard rule #3** (verdict + `### Findings` + `### What's missing or risky`), then offer to draft the `kody_fix_pr` notes:

1. `github_get_issue(N)` — list claims verbatim.
2. `github_get_pull_request({ number: N, includeDiff: true })` — list files touched.
3. For each claim naming a field/function/behavior: `github_search_code` + `github_get_file`. Check whether the diff touches that path.
4. Claims not covered by diff = the gap. No gap → say so explicitly in `### Findings`.
5. Draft `notes` for `kody_fix_pr`: gap in one sentence, file:line evidence, what to change.
6. Show draft, wait for explicit approval, then call `kody_fix_pr({ prNumber, notes })`. End with the forward-driving approval question from the persona.
