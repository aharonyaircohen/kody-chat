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

## Hand-off

The `release-merge` stage reads the prep PR URL from your `PR_SUMMARY`. Output it on the first line as `PREP_PR: <url>` and the new version on the second line as `NEW_VERSION: <semver>`.
