import type { Octokit } from "@octokit/rest";

export type RepositoryFileChange =
  | {
      type: "write";
      path: string;
      base64Content: string;
      mode?: "100644" | "100755" | "120000";
    }
  | {
      type: "delete";
      path: string;
    };

export interface RepositoryMutationResult {
  commitSha: string;
  fileShas: Record<string, string>;
}

const MAX_COMMIT_ATTEMPTS = 3;

function isNonFastForward(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  return (
    candidate.status === 422 &&
    /not a fast forward|non-fast-forward/i.test(candidate.message ?? "")
  );
}

function assertUniquePaths(changes: RepositoryFileChange[]): void {
  const paths = new Set<string>();
  for (const change of changes) {
    if (paths.has(change.path)) {
      throw new Error(`Duplicate repository path: ${change.path}`);
    }
    paths.add(change.path);
  }
}

export async function commitFileChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  message: string,
  changes: RepositoryFileChange[],
): Promise<RepositoryMutationResult> {
  if (changes.length === 0) {
    throw new Error("At least one repository change is required");
  }
  assertUniquePaths(changes);

  const repository = await octokit.rest.repos.get({ owner, repo });
  const branch = repository.data.default_branch;
  const fileShas: Record<string, string> = {};
  const tree = await Promise.all(
    changes.map(async (change) => {
      if (change.type === "delete") {
        return {
          path: change.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null,
        };
      }

      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: change.base64Content,
        encoding: "base64",
      });
      fileShas[change.path] = blob.data.sha;
      return {
        path: change.path,
        mode: change.mode ?? ("100644" as const),
        type: "blob" as const,
        sha: blob.data.sha,
      };
    }),
  );

  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
    const currentRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const parentSha = currentRef.data.object.sha;
    const parentCommit = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
    });
    const nextTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.data.tree.sha,
      tree,
    });
    const nextCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: nextTree.data.sha,
      parents: [parentSha],
    });
    try {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: nextCommit.data.sha,
        force: false,
      });
      return { commitSha: nextCommit.data.sha, fileShas };
    } catch (error) {
      if (attempt === MAX_COMMIT_ATTEMPTS || !isNonFastForward(error)) {
        throw error;
      }
    }
  }

  throw new Error("Repository commit retry exhausted");
}
