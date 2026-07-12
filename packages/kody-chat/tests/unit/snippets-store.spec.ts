/**
 * Unit tests for the snippets store
 * (src/dashboard/lib/snippets/store.ts): validation, caching, and the
 * atomic CAS read-modify-write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
}));
vi.mock("@kody-ade/base/logger", () => ({ logger: h.logger }));

import {
  getSnippets,
  mutateSnippets,
  _resetSnippetsCache,
} from "@dashboard/lib/snippets/store";
import type { SnippetConfig } from "@dashboard/lib/snippets/types";

const octokit = {} as Octokit;

const SNIPPET: SnippetConfig = {
  id: "analytics-tag",
  name: "Analytics tag",
  enabled: true,
  placement: "body-start",
  html: "<script>tag()</script>",
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetSnippetsCache();
});

describe("getSnippets", () => {
  it("returns [] when no config exists and caches per repo", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await getSnippets(octokit, "acme", "shop")).toEqual([]);
    await getSnippets(octokit, "acme", "shop");
    expect(h.readStateText).toHaveBeenCalledTimes(1);
  });

  it("loads valid snippets and tolerates a broken file", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify({ version: 1, snippets: [SNIPPET] }),
      sha: "s1",
      path: "p",
    });
    const snippets = await getSnippets(octokit, "acme", "shop");
    expect(snippets).toEqual([SNIPPET]);

    _resetSnippetsCache();
    h.readStateText.mockResolvedValue({
      content: "not json",
      sha: "s1",
      path: "p",
    });
    expect(await getSnippets(octokit, "acme", "shop")).toEqual([]);
    expect(h.logger.warn).toHaveBeenCalled();
  });
});

describe("mutateSnippets", () => {
  it("writes with the sha of the read it mutated (single attempt)", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify({ version: 1, snippets: [] }),
      sha: "s0",
      path: "p",
    });
    h.writeStateText.mockResolvedValue({ sha: "s1", path: "p", htmlUrl: null });

    const next = await mutateSnippets(octokit, "acme", "shop", (existing) => [
      ...existing,
      SNIPPET,
    ]);
    expect(next).toEqual([SNIPPET]);
    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "s0", maxAttempts: 1 }),
    );
  });

  it("re-runs the whole cycle on conflict so no entry is dropped", async () => {
    h.readStateText
      .mockResolvedValueOnce({
        content: JSON.stringify({ version: 1, snippets: [] }),
        sha: "s0",
        path: "p",
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          snippets: [{ ...SNIPPET, id: "other" }],
        }),
        sha: "s1",
        path: "p",
      });
    h.writeStateText
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ sha: "s2", path: "p", htmlUrl: null });

    const next = await mutateSnippets(octokit, "acme", "shop", (existing) => [
      ...existing,
      SNIPPET,
    ]);
    expect(next.map((snippet) => snippet.id)).toEqual([
      "other",
      "analytics-tag",
    ]);
  });
});
