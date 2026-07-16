/** @fileoverview Unit tests for the Convex-backed managed goal store. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

const companyStore = vi.hoisted(() => ({
  getCompanyStoreTarget: vi.fn(() => ({
    owner: "test-store-owner",
    repo: "test-store-repo",
    ref: "main",
  })),
  companyStoreAssetPath: vi.fn(async (_octokit, _kind, ...segments: string[]) =>
    ["goals", ...segments].join("/"),
  ),
  listCompanyStoreDirectorySafe: vi.fn(
    async (
      ..._args: unknown[]
    ): Promise<Array<{ name: string; type: string }>> => [],
  ),
  readCompanyStoreText: vi.fn(
    async (..._args: unknown[]): Promise<string | null> => null,
  ),
}));

vi.mock("../../src/dashboard/lib/company-store/assets", () => companyStore);

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import {
  deleteManagedGoalFile,
  listManagedGoalFiles,
  readManagedGoalFile,
  writeManagedGoalFile,
} from "../../src/dashboard/lib/managed-goals-files";
import type { ManagedGoalState } from "../../src/dashboard/lib/managed-goals";

const baseState: ManagedGoalState = {
  version: 1,
  state: "active",
  type: "improve",
  destination: {
    outcome: "Goal creation works.",
    evidence: ["planReady"],
  },
  capabilities: ["plan"],
  route: [
    {
      stage: "plan",
      evidence: "planReady",
      capability: "plan",
    },
  ],
  facts: {},
  blockers: [],
};

/** Todo-file JSON as stored in the Convex goals `state` field. */
function managedTodoState(id: string): Record<string, unknown> {
  return {
    version: 1,
    title: id,
    description: baseState.destination.outcome,
    createdAt: "2026-06-28T00:00:00.000Z",
    managed: true,
    managedModel: "agentGoal",
    state: baseState.state,
    type: baseState.type,
    evidence: baseState.destination.evidence,
    capabilities: baseState.capabilities,
    route: baseState.route,
    facts: baseState.facts,
    blockers: baseState.blockers,
    items: baseState.destination.evidence.map((evidence) => ({
      id: evidence,
      title: evidence,
      body: "",
      assignee: null,
      completed: false,
      createdAt: "2026-06-28T00:00:00.000Z",
      completedAt: null,
    })),
  };
}

const regularTodoState = {
  version: 1,
  title: "Regular list",
  description: "",
  createdAt: "2026-06-28T00:00:00.000Z",
  items: [
    {
      id: "item-1",
      title: "Keep this todo",
      body: "",
      assignee: null,
      completed: false,
      createdAt: "2026-06-28T00:00:00.000Z",
      completedAt: null,
    },
  ],
};

let repoCounter = 0;
function nextRepo(): string {
  repoCounter += 1;
  return `repo-${repoCounter}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("managed goal convex store", () => {
  it("returns null when the goal doc does not exist", async () => {
    convex.query.mockResolvedValue(null);
    const file = await readManagedGoalFile(
      "goal-creation-works",
      {} as never,
      "test-owner",
      nextRepo(),
    );
    expect(file).toBeNull();
    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("goals:get");
    expect(args).toMatchObject({ goalId: "goal-creation-works" });
  });

  it("reads a managed goal from its Convex doc", async () => {
    const repo = nextRepo();
    convex.query.mockResolvedValue({
      goalId: "goal-creation-works",
      state: managedTodoState("goal-creation-works"),
    });

    const file = await readManagedGoalFile(
      "goal-creation-works",
      {} as never,
      "test-owner",
      repo,
    );

    expect(file?.state.destination.outcome).toBe("Goal creation works.");
    expect(file?.path).toBe("todos/goal-creation-works.json");
    const [, args] = convex.query.mock.calls[0]!;
    expect(args).toMatchObject({ tenantId: `test-owner/${repo}` });
  });

  it("lists managed goals and skips regular todo lists", async () => {
    const repo = nextRepo();
    convex.query.mockResolvedValue([
      { goalId: "goal-a", state: managedTodoState("goal-a") },
      { goalId: "shopping", state: regularTodoState },
    ]);

    const goals = await listManagedGoalFiles({} as never, "test-owner", repo);

    expect(goals.map((goal) => goal.id)).toEqual(["goal-a"]);
    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("goals:list");
    expect(args).toEqual({ tenantId: `test-owner/${repo}` });
  });

  it("writes a managed goal via goals.save with the todo doc shape", async () => {
    const repo = nextRepo();
    convex.query.mockResolvedValue(null);
    convex.mutation.mockResolvedValue("id-1");

    await writeManagedGoalFile({
      owner: "test-owner",
      repo,
      id: "goal-creation-works",
      state: baseState,
    });

    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("goals:save");
    const typed = args as {
      tenantId: string;
      goalId: string;
      state: { managed?: boolean; title?: string };
      updatedAt: string;
    };
    expect(typed.tenantId).toBe(`test-owner/${repo}`);
    expect(typed.goalId).toBe("goal-creation-works");
    expect(typed.state.managed).toBe(true);
    expect(typeof typed.updatedAt).toBe("string");
  });

  it("refuses to overwrite a regular todo list as a managed goal", async () => {
    convex.query.mockResolvedValue({
      goalId: "shopping",
      state: regularTodoState,
    });

    await expect(
      writeManagedGoalFile({
        owner: "test-owner",
        repo: nextRepo(),
        id: "shopping",
        state: baseState,
      }),
    ).rejects.toThrow(/Cannot overwrite regular todo list/);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("deletes a managed goal via goals.remove", async () => {
    const repo = nextRepo();
    convex.query.mockResolvedValue({
      goalId: "goal-a",
      state: managedTodoState("goal-a"),
    });
    convex.mutation.mockResolvedValue(null);

    await deleteManagedGoalFile({
      octokit: {} as never,
      owner: "test-owner",
      repo,
      id: "goal-a",
    });

    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("goals:remove");
    expect(args).toEqual({
      tenantId: `test-owner/${repo}`,
      goalId: "goal-a",
    });
  });

  it("skips deletion when the goal does not exist", async () => {
    convex.query.mockResolvedValue(null);
    await deleteManagedGoalFile({
      octokit: {} as never,
      owner: "test-owner",
      repo: nextRepo(),
      id: "missing",
    });
    expect(convex.mutation).not.toHaveBeenCalled();
  });
});
