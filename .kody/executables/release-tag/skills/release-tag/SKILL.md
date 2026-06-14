# release-tag skill

Stage 3 of the four-stage release chain.

## What this stage owns

- Creating an annotated git tag on the merged commit.
- Pushing the tag.
- Creating a GitHub Release with auto-generated notes.
- (Optional) Uploading build artifacts.
- (Optional) Posting a release announcement.

## What this stage does NOT own

- Opening a dev→main PR.
- Editing or moving an existing tag.
- Force-pushing the tag.

## Hand-off

The `release-promote` stage reads the release URL and tag from your `PR_SUMMARY`. Output `TAG:` on line 1, `RELEASE_URL:` on line 2, `NEW_VERSION:` on line 3.
