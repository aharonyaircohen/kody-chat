import { describe, expect, it } from "vitest";
import {
  repositoryAuthAfterRemoval,
  type KodyAuth,
} from "../../src/dashboard/lib/auth-context";

function authWithRepos(count: number): KodyAuth {
  const repos = Array.from({ length: count }, (_, index) => ({
    repoUrl: `https://github.com/acme/repo-${index}`,
    owner: "acme",
    repo: `repo-${index}`,
    token: `token-${index}`,
    addedAt: index,
    isLogin: index === 0,
    user: { login: "octo", avatar_url: "", id: 1 },
  }));
  const current = repos[0]!;
  return {
    ...current,
    user: current.user!,
    loggedInAt: 1,
    repos,
    currentRepoIndex: 0,
  };
}

describe("repositoryAuthAfterRemoval", () => {
  it("allows the original and final repository to be removed", () => {
    expect(repositoryAuthAfterRemoval(authWithRepos(1), 0)).toBeNull();
  });

  it("falls back to the remaining repository when the active one is removed", () => {
    const result = repositoryAuthAfterRemoval(authWithRepos(2), 0);
    expect(result).toMatchObject({
      owner: "acme",
      repo: "repo-1",
      token: "token-1",
      currentRepoIndex: 0,
    });
    expect(result?.repos).toHaveLength(1);
  });

  it("ignores an invalid repository index", () => {
    const auth = authWithRepos(1);
    expect(repositoryAuthAfterRemoval(auth, 4)).toBe(auth);
  });
});
