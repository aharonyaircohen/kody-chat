/**
 * Resilience of the CMS config loader: transient GitHub read failures are
 * retried, and a failed reload serves the last good config instead of
 * taking the cms tool family down for the turn.
 *
 * @testFramework vitest
 * @domain cms
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";

const readStateTextMock = vi.hoisted(() => vi.fn());

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: readStateTextMock,
}));

import {
  invalidateCmsConfigCache,
  loadCmsConfigFromState,
} from "../../src/config";

const octokit = {} as Octokit;

const CONFIG_JSON = JSON.stringify({
  version: 1,
  name: "Test CMS",
  defaultAdapter: "github",
  writePolicy: "read-only",
  collections: [
    {
      name: "posts",
      label: "Posts",
      fields: [{ name: "title", type: "text" }],
    },
  ],
});

function stateFile(content: string) {
  return { path: "cms/config.json", content, sha: "abc", htmlUrl: "", size: 1 };
}

describe("loadCmsConfigFromState resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCmsConfigCache();
  });

  it("retries a transient read failure and succeeds", async () => {
    readStateTextMock
      .mockRejectedValueOnce(new Error("<html>Bad request</html>"))
      .mockResolvedValue(stateFile(CONFIG_JSON));

    const config = await loadCmsConfigFromState(octokit, "acme", "app");

    expect(Object.keys(config?.collections ?? {})).toEqual(["posts"]);
    expect(readStateTextMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("serves the last good config when a reload keeps failing", async () => {
    readStateTextMock.mockResolvedValue(stateFile(CONFIG_JSON));
    const first = await loadCmsConfigFromState(octokit, "acme", "app");
    expect(Object.keys(first?.collections ?? {})).toEqual(["posts"]);

    // Expire the fresh cache, then make every read fail persistently.
    invalidateCmsConfigCache();
    // invalidate clears LAST_GOOD too — reload once to repopulate it.
    const second = await loadCmsConfigFromState(octokit, "acme", "app");
    expect(Object.keys(second?.collections ?? {})).toEqual(["posts"]);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(61_000);
      readStateTextMock.mockRejectedValue(new Error("rate limited"));
      const promise = loadCmsConfigFromState(octokit, "acme", "app");
      await vi.runAllTimersAsync();
      const stale = await promise;
      expect(Object.keys(stale?.collections ?? {})).toEqual(["posts"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still throws when there is no last good config", async () => {
    readStateTextMock.mockRejectedValue(new Error("rate limited"));

    vi.useFakeTimers();
    try {
      const promise = loadCmsConfigFromState(octokit, "acme", "app");
      const assertion = expect(promise).rejects.toThrow("rate limited");
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
