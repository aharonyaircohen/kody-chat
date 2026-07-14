/**
 * Unit tests for fetchDefaultBranchCI's self-run exclusion policy
 * (packages/base/src/github/workflows.ts).
 *
 * Issue #2: the kody-management workflow that hosts the agency-observer loop
 * was itself a check on the latest commit, so its in-progress check pushed the
 * GraphQL `statusCheckRollup` to PENDING/EXPECTED. The observer then reported
 * "Default branch CI state is unknown" even though every *relevant* CI run on
 * the branch had completed green. These tests pin the policy:
 *
 *   - rollup SUCCESS / FAILURE / ERROR: returned as-is, no policy.
 *   - rollup PENDING with a non-self run still in-progress: keep PENDING
 *     (genuine pending CI, the operator must see it).
 *   - rollup PENDING where the only in-flight run is the self-run and a recent
 *     non-self run completed green: re-classify as success.
 *   - rollup PENDING where the only in-flight run is the self-run and the
 *     latest non-self run completed failing: re-classify as failure.
 *   - rollup PENDING where the only in-flight run is the self-run and there
 *     are no completed non-self runs to anchor on: unknown (don't fabricate
 *     a green signal).
 *
 * GitHub is mocked at the `@kody-ade/base/github/core` boundary — the same
 * seam the source uses for `getOctokit` / `getOwner` / `getRepo` / `cache`,
 * and the same pattern as audit.spec.ts / manifest-store.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  graphql: vi.fn(),
  reposGet: vi.fn(),
  listWorkflowRunsForRepo: vi.fn(),
}));

vi.mock("@kody-ade/base/github/core", () => ({
  getOctokit: () => ({
    graphql: h.graphql,
    repos: { get: h.reposGet },
    actions: { listWorkflowRunsForRepo: h.listWorkflowRunsForRepo },
  }),
  getOwner: () => "acme",
  getRepo: () => "widgets",
  getCached: <T,>(key: string): T | null => null,
  getStale: <T,>(_key: string): { data: T; etag?: string } | null => null,
  setCache: (_key: string, _ttl: number, _data: unknown) => undefined,
}));

import {
  fetchDefaultBranchCI,
  type DefaultBranchCI,
} from "@kody-ade/base/github/workflows";

const MAIN_SHA = "f4b76744deadbeefcafebabefeedface00000000";

function rollupGraphQLResponse(state: string, nodes: unknown[] = []) {
  return {
    repository: {
      defaultBranchRef: {
        name: "main",
        target: {
          oid: MAIN_SHA,
          statusCheckRollup: {
            state,
            contexts: { nodes },
          },
        },
      },
    },
  };
}

function successfulCheckRun(name: string) {
  return {
    __typename: "CheckRun" as const,
    name,
    status: "COMPLETED" as const,
    conclusion: "SUCCESS" as const,
    permalink: `https://github.com/acme/widgets/runs/${name}`,
    startedAt: "2026-07-12T15:00:00Z",
    completedAt: "2026-07-12T15:01:00Z",
  };
}

function inProgressCheckRun(name: string) {
  return {
    __typename: "CheckRun" as const,
    name,
    status: "IN_PROGRESS" as const,
    conclusion: null,
    permalink: `https://github.com/acme/widgets/runs/${name}`,
    startedAt: "2026-07-12T15:00:00Z",
    completedAt: null,
  };
}

function completedRun(
  id: number,
  status: "completed",
  conclusion: string | null,
): { id: number; status: "completed"; conclusion: string | null } {
  return { id, status, conclusion };
}
function inFlightRun(id: number, status: "in_progress" | "queued") {
  return { id, status, conclusion: null };
}

beforeEach(() => {
  h.graphql.mockReset();
  h.reposGet.mockReset();
  h.listWorkflowRunsForRepo.mockReset();
  // Default: branch lookup resolves to "main".
  h.reposGet.mockResolvedValue({ data: { default_branch: "main" } });
  // Default: GraphQL returns a successful empty rollup; tests override.
  h.graphql.mockResolvedValue(rollupGraphQLResponse("SUCCESS", []));
  // Default: listWorkflowRunsForRepo returns no runs; tests override when
  // the policy path is exercised.
  h.listWorkflowRunsForRepo.mockResolvedValue({ data: { workflow_runs: [] } });
});

describe("fetchDefaultBranchCI — baseline behavior (no excludeRunId)", () => {
  it("returns SUCCESS from the rollup without consulting workflow runs", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("SUCCESS", [successfulCheckRun("ci / build")]),
    );

    const result = await fetchDefaultBranchCI();
    expect(result.state).toBe("success");
    expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
  });

  it("returns FAILURE from the rollup without consulting workflow runs", async () => {
    h.graphql.mockResolvedValueOnce(rollupGraphQLResponse("FAILURE", []));

    const result = await fetchDefaultBranchCI();
    expect(result.state).toBe("failure");
    expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
  });

  it("returns PENDING from the rollup without consulting workflow runs when no excludeRunId is in scope", async () => {
    // We're running this inside GitHub Actions, where GITHUB_RUN_ID is set
    // in the test process. Force the no-self-run path so the rollup-only
    // branch is exercised.
    const previous = process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ID;
    try {
      h.graphql.mockResolvedValueOnce(rollupGraphQLResponse("PENDING", []));

      const result = await fetchDefaultBranchCI();
      expect(result.state).toBe("pending");
      expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
    } finally {
      if (previous !== undefined) process.env.GITHUB_RUN_ID = previous;
    }
  });

  it("returns SUCCESS from the rollup even when a self-run env var is set", async () => {
    // SUCCESS rollup short-circuits the policy — the env auto-detection must
    // not cause a second workflow-run lookup.
    const previous = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = "99999";
    try {
      h.graphql.mockResolvedValueOnce(
        rollupGraphQLResponse("SUCCESS", [successfulCheckRun("ci / build")]),
      );

      const result = await fetchDefaultBranchCI();
      expect(result.state).toBe("success");
      expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = previous;
    }
  });
});

describe("fetchDefaultBranchCI — self-run exclusion policy", () => {
  it("classifies as success when the only in-flight run is the self-run and the latest non-self run completed green", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("EXPECTED", [inProgressCheckRun("kody / run")]),
    );
    h.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          inFlightRun(4242, "in_progress"), // self-run — the observer's host
          completedRun(4241, "completed", "success"), // prior kody run, green
          completedRun(4240, "completed", "success"),
        ],
      },
    });

    const result = await fetchDefaultBranchCI({ excludeRunId: 4242 });
    expect(result.state).toBe("success");
    expect(h.listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(h.listWorkflowRunsForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "main", per_page: 30 }),
    );
  });

  it("classifies as failure when the only in-flight run is the self-run and the latest non-self run completed failing", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("EXPECTED", [inProgressCheckRun("kody / run")]),
    );
    h.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          inFlightRun(5151, "in_progress"), // self-run
          completedRun(5150, "completed", "failure"), // most recent non-self: red
        ],
      },
    });

    const result = await fetchDefaultBranchCI({ excludeRunId: 5151 });
    expect(result.state).toBe("failure");
  });

  it("classifies timed_out / action_required / startup_failure as failure", async () => {
    for (const conclusion of ["timed_out", "action_required", "startup_failure"]) {
      h.graphql.mockReset();
      h.reposGet.mockReset();
      h.listWorkflowRunsForRepo.mockReset();
      h.reposGet.mockResolvedValue({ data: { default_branch: "main" } });
      h.graphql.mockResolvedValueOnce(
        rollupGraphQLResponse("PENDING", [inProgressCheckRun("kody / run")]),
      );
      h.listWorkflowRunsForRepo.mockResolvedValueOnce({
        data: {
          workflow_runs: [
            inFlightRun(9000, "in_progress"),
            completedRun(8999, "completed", conclusion),
          ],
        },
      });

      const result = await fetchDefaultBranchCI({ excludeRunId: 9000 });
      expect(result.state).toBe(`failure` as DefaultBranchCI["state"]);
    }
  });

  it("keeps PENDING when another non-self run is in-flight — that's a genuine pending CI", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("PENDING", [
        inProgressCheckRun("kody / run"),
        inProgressCheckRun("lint / run"),
      ]),
    );
    h.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          inFlightRun(7000, "in_progress"), // self-run
          inFlightRun(7001, "queued"), // non-self — still genuinely pending
        ],
      },
    });

    const result = await fetchDefaultBranchCI({ excludeRunId: 7000 });
    expect(result.state).toBe("pending");
  });

  it("returns unknown when only the self-run is in-flight and no completed non-self run exists", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("PENDING", [inProgressCheckRun("kody / run")]),
    );
    h.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          inFlightRun(8000, "in_progress"), // self-run — only run on branch
        ],
      },
    });

    const result = await fetchDefaultBranchCI({ excludeRunId: 8000 });
    // No anchor; don't fabricate green.
    expect(result.state).toBe("unknown");
  });

  it("falls back to the rollup state when the self-run is already completed (no policy adjustment)", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("PENDING", [inProgressCheckRun("ci / build")]),
    );
    h.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          completedRun(6000, "completed", "success"), // self-run already done
        ],
      },
    });

    const result = await fetchDefaultBranchCI({ excludeRunId: 6000 });
    // Self-run isn't driving the PENDING (a non-self check is). Keep rollup.
    expect(result.state).toBe("pending");
  });

  it("does not consult workflow runs when the rollup is already SUCCESS", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("SUCCESS", [successfulCheckRun("kody / run")]),
    );

    const result = await fetchDefaultBranchCI({ excludeRunId: 1234 });
    expect(result.state).toBe("success");
    expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
  });

  it("does not consult workflow runs when the rollup is FAILURE", async () => {
    h.graphql.mockResolvedValueOnce(rollupGraphQLResponse("FAILURE", []));

    const result = await fetchDefaultBranchCI({ excludeRunId: 1234 });
    expect(result.state).toBe("failure");
    expect(h.listWorkflowRunsForRepo).not.toHaveBeenCalled();
  });

  it("falls back to the rollup state when listWorkflowRuns errors (no fabricated success)", async () => {
    h.graphql.mockResolvedValueOnce(
      rollupGraphQLResponse("PENDING", [inProgressCheckRun("kody / run")]),
    );
    h.listWorkflowRunsForRepo.mockRejectedValueOnce(new Error("network blip"));

    const result = await fetchDefaultBranchCI({ excludeRunId: 4242 });
    expect(result.state).toBe("pending");
  });

  it("reads GITHUB_RUN_ID from env when no override is passed", async () => {
    const previous = process.env.GITHUB_RUN_ID;
    process.env.GITHUB_RUN_ID = "4321";
    try {
      h.graphql.mockResolvedValueOnce(
        rollupGraphQLResponse("EXPECTED", [inProgressCheckRun("kody / run")]),
      );
      h.listWorkflowRunsForRepo.mockResolvedValueOnce({
        data: {
          workflow_runs: [
            inFlightRun(4321, "in_progress"), // self-run from env
            completedRun(4320, "completed", "success"),
          ],
        },
      });

      const result = await fetchDefaultBranchCI();
      expect(result.state).toBe("success");
    } finally {
      if (previous === undefined) delete process.env.GITHUB_RUN_ID;
      else process.env.GITHUB_RUN_ID = previous;
    }
  });
});