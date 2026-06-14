# release-prepare skill

Stage 1 of the four-stage release chain.

## What this stage owns

- Bumping the version in `package.json`.
- Updating `CHANGELOG.md`.
- Running the full test suite and linter.
- Opening a `chore(release): prepare vX.Y.Z` PR.
- Waiting for that PR's CI to pass.

## What this stage does NOT own

- Merging any PR.
- Tagging a release.
- Opening a dev→main PR.

## Output contract

```
DONE
PREP_PR: <url>
NEW_VERSION: <semver>
```

Or `FAILED: <reason>` on any failure.
