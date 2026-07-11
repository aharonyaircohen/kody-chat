import { describe, expect, it, vi } from "vitest";

vi.mock("@dashboard/lib/github-client", () => ({
  invalidateIssueCache: vi.fn(),
  invalidatePRCache: vi.fn(),
}));

vi.mock("@kody-ade/base/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createGitHubTools } from "../../app/api/kody/chat/tools/github-tools";

type GitHubSearchResult = {
  matches: Array<{ path: string; url: string; lineInFragment: number | null }>;
};

describe("github_search_code internal file links", () => {
  it("returns Kody /files links for connected-repo search results", async () => {
    const octokit = {
      rest: {
        search: {
          code: vi.fn().mockResolvedValue({
            data: {
              total_count: 2,
              items: [
                {
                  path: "src/dashboard/lib/api.ts",
                  html_url:
                    "https://github.com/acme/app/blob/main/src/dashboard/lib/api.ts",
                  text_matches: [],
                },
                {
                  path: "app/api/kody/tasks/route.ts",
                  html_url:
                    "https://github.com/acme/app/blob/main/app/api/kody/tasks/route.ts",
                  text_matches: [
                    {
                      fragment: "const issue = await createIssue()",
                      matches: [{ indices: [6, 11] }],
                    },
                  ],
                },
              ],
            },
          }),
        },
      },
    };
    const tools = createGitHubTools({
      owner: "acme",
      repo: "app",
      octokit: octokit as never,
    }) as unknown as {
      github_search_code: {
        execute: (input: unknown) => Promise<GitHubSearchResult>;
      };
    };

    const result = await tools.github_search_code.execute({ query: "issue" });

    expect(result.matches.map((m) => m.url)).toEqual([
      "/files/src/dashboard/lib/api.ts",
      "/files/app/api/kody/tasks/route.ts",
    ]);
  });
});
