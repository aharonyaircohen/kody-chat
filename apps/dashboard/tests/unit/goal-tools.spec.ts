import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGoalTools } from "../../app/api/kody/chat/tools/goal-tools";

vi.mock("@kody-ade/base/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const invalidateIssueCache = vi.fn();
vi.mock("@dashboard/lib/github-client", () => ({
  invalidateIssueCache: (...args: unknown[]) => invalidateIssueCache(...args),
}));

const readGoalsManifestFresh = vi.fn();
vi.mock("@dashboard/lib/goals-server", () => ({
  readGoalsManifestFresh: (...args: unknown[]) =>
    readGoalsManifestFresh(...args),
}));

const listManagedGoalFiles = vi.fn();
const readManagedGoalFile = vi.fn();
const writeManagedGoalFile = vi.fn();
vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: (...args: unknown[]) => listManagedGoalFiles(...args),
  readManagedGoalFile: (...args: unknown[]) => readManagedGoalFile(...args),
  writeManagedGoalFile: (...args: unknown[]) => writeManagedGoalFile(...args),
}));

const GOAL = {
  id: "ship-v2",
  name: "Ship v2",
  discussionNumber: 1533,
  description: "Ship the v2 release.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  dueDate: "2026-02-01",
  assignee: "alice",
};

function makeOctokit() {
  return {
    rest: {
      issues: {
        listForRepo: vi.fn().mockResolvedValue({ data: [] }),
        addLabels: vi.fn().mockResolvedValue({ data: {} }),
        removeLabel: vi.fn().mockResolvedValue({ data: {} }),
      },
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      },
      actions: {
        createWorkflowDispatch: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
  };
}

type Tools = Record<
  string,
  { execute: (input: unknown) => Promise<Record<string, unknown>> }
>;

function makeTools(octokit = makeOctokit()) {
  const tools = createGoalTools({
    octokit: octokit as never,
    owner: "acme",
    repo: "app",
  }) as unknown as Tools;
  return { tools, octokit };
}

beforeEach(() => {
  vi.clearAllMocks();
  readGoalsManifestFresh.mockResolvedValue({ manifest: { goals: [GOAL] } });
});

describe("list_goals", () => {
  it("summarizes goals with number, id, and task label", async () => {
    const { tools } = makeTools();
    const result = await tools.list_goals.execute({});
    expect(result).toEqual({
      goals: [
        {
          number: 1533,
          id: "ship-v2",
          name: "Ship v2",
          dueDate: "2026-02-01",
          assignee: "alice",
          taskLabel: "goal:ship-v2",
        },
      ],
    });
  });

  it("returns an error when the manifest read fails", async () => {
    readGoalsManifestFresh.mockRejectedValue(new Error("boom"));
    const { tools } = makeTools();
    const result = await tools.list_goals.execute({});
    expect(result).toEqual({ error: "Could not read the goals manifest." });
  });
});

describe("get_goal", () => {
  it("resolves a goal by discussion number and lists attached tasks", async () => {
    const { tools, octokit } = makeTools();
    octokit.rest.issues.listForRepo.mockResolvedValue({
      data: [
        { number: 7, title: "Task", state: "open" },
        { number: 8, title: "PR", state: "open", pull_request: {} },
      ],
    });

    const result = await tools.get_goal.execute({ number: 1533 });

    expect(octokit.rest.issues.listForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ labels: "goal:ship-v2", state: "all" }),
    );
    expect(result.attachedTasks).toEqual([
      { number: 7, title: "Task", state: "open" },
    ]);
    expect(result.goal).toMatchObject({
      id: "ship-v2",
      description: "Ship the v2 release.",
      createdAt: GOAL.createdAt,
      updatedAt: GOAL.updatedAt,
    });
  });

  it("resolves a goal by slug id case-insensitively", async () => {
    const { tools } = makeTools();
    const result = await tools.get_goal.execute({ id: "SHIP-V2" });
    expect(result.goal).toMatchObject({ id: "ship-v2" });
  });

  it("returns a not-found error for unknown numbers", async () => {
    const { tools } = makeTools();
    const result = await tools.get_goal.execute({ number: 999 });
    expect(result.error).toContain("No goal #999");
  });

  it("still returns the goal when the attached-task lookup fails", async () => {
    const { tools, octokit } = makeTools();
    octokit.rest.issues.listForRepo.mockRejectedValue(new Error("rate limit"));
    const result = await tools.get_goal.execute({ number: 1533 });
    expect(result.goal).toMatchObject({ id: "ship-v2" });
    expect(result.attachedTasks).toEqual([]);
  });

  it("truncates very long descriptions", async () => {
    readGoalsManifestFresh.mockResolvedValue({
      manifest: { goals: [{ ...GOAL, description: "x".repeat(5000) }] },
    });
    const { tools } = makeTools();
    const result = await tools.get_goal.execute({ number: 1533 });
    expect(String((result.goal as { description: string }).description)).toContain(
      "[... truncated ...]",
    );
  });

  it("returns an error when the manifest read fails", async () => {
    readGoalsManifestFresh.mockRejectedValue(new Error("boom"));
    const { tools } = makeTools();
    const result = await tools.get_goal.execute({ number: 1533 });
    expect(result).toEqual({ error: "Could not read the goals manifest." });
  });
});

describe("list_managed_goals / get_managed_goal", () => {
  const managedState = {
    state: "active",
    type: "release",
    destination: { outcome: "v1 shipped", evidence: ["qaPassed"] },
    stage: "qa",
    blockers: [],
  };

  it("lists managed goals in summary shape", async () => {
    listManagedGoalFiles.mockResolvedValue([
      { id: "ship", path: "goals/ship.json", state: managedState },
    ]);
    const { tools } = makeTools();
    const result = await tools.list_managed_goals.execute({});
    expect(result).toEqual({
      goals: [
        {
          id: "ship",
          path: "goals/ship.json",
          state: "active",
          type: "release",
          outcome: "v1 shipped",
          evidence: ["qaPassed"],
          stage: "qa",
          blockers: [],
        },
      ],
    });
  });

  it("returns an error when listing fails", async () => {
    listManagedGoalFiles.mockRejectedValue(new Error("nope"));
    const { tools } = makeTools();
    expect(await tools.list_managed_goals.execute({})).toEqual({
      error: "Could not list managed goals.",
    });
  });

  it("reads one managed goal by id", async () => {
    readManagedGoalFile.mockResolvedValue({
      path: "goals/ship.json",
      state: managedState,
    });
    const { tools } = makeTools();
    const result = await tools.get_managed_goal.execute({ id: "ship" });
    expect(result.goal).toMatchObject({ id: "ship", path: "goals/ship.json" });
  });

  it("reports a missing managed goal", async () => {
    readManagedGoalFile.mockResolvedValue(null);
    const { tools } = makeTools();
    expect(await tools.get_managed_goal.execute({ id: "ghost" })).toEqual({
      error: 'Managed goal "ghost" not found.',
    });
  });
});

describe("create_managed_goal", () => {
  const input = {
    type: "release",
    outcome: "Version 1.2.3 is published.",
    evidence: ["qaPassed"],
    route: [{ stage: "qa", evidence: "qaPassed", capability: "qa-run" }],
  };

  it("creates a goal, derives the id from the outcome, and wakes Kody", async () => {
    readManagedGoalFile.mockResolvedValue(null);
    writeManagedGoalFile.mockResolvedValue(undefined);
    const { tools, octokit } = makeTools();

    const result = await tools.create_managed_goal.execute(input);

    expect(result.ok).toBe(true);
    expect(result.engineDispatched).toBe(true);
    expect((result.goal as { id: string }).id).toBe(
      "version-1-2-3-is-published",
    );
    expect(writeManagedGoalFile).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "app" }),
    );
    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: "kody.yml", ref: "main" }),
    );
  });

  it("refuses to overwrite an existing goal", async () => {
    readManagedGoalFile.mockResolvedValue({ path: "p", state: {} });
    const { tools } = makeTools();
    const result = await tools.create_managed_goal.execute({
      ...input,
      id: "ship",
    });
    expect(result).toEqual({ error: 'Managed goal "ship" already exists.' });
    expect(writeManagedGoalFile).not.toHaveBeenCalled();
  });

  it("still succeeds when the workflow dispatch fails", async () => {
    readManagedGoalFile.mockResolvedValue(null);
    writeManagedGoalFile.mockResolvedValue(undefined);
    const octokit = makeOctokit();
    octokit.rest.actions.createWorkflowDispatch.mockRejectedValue(
      new Error("403"),
    );
    const { tools } = makeTools(octokit);

    const result = await tools.create_managed_goal.execute(input);
    expect(result.ok).toBe(true);
    expect(result.engineDispatched).toBe(false);
  });

  it("surfaces write errors as tool errors", async () => {
    readManagedGoalFile.mockResolvedValue(null);
    writeManagedGoalFile.mockRejectedValue(new Error("write denied"));
    const { tools } = makeTools();
    expect(await tools.create_managed_goal.execute(input)).toEqual({
      error: "write denied",
    });
  });
});

describe("attach_task_to_goal / detach_task_from_goal", () => {
  it("adds the goal label and invalidates the issue cache", async () => {
    const { tools, octokit } = makeTools();
    const result = await tools.attach_task_to_goal.execute({
      taskNumber: 7,
      goalNumber: 1533,
    });

    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      issue_number: 7,
      labels: ["goal:ship-v2"],
    });
    expect(invalidateIssueCache).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ ok: true, taskLabel: "goal:ship-v2" });
  });

  it("returns mission-not-found for an unknown goal", async () => {
    const { tools, octokit } = makeTools();
    const result = await tools.attach_task_to_goal.execute({
      taskNumber: 7,
      goalId: "ghost",
    });
    expect(result.error).toContain("Mission not found");
    expect(octokit.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the label write fails", async () => {
    const octokit = makeOctokit();
    octokit.rest.issues.addLabels.mockRejectedValue(new Error("404"));
    const { tools } = makeTools(octokit);
    const result = await tools.attach_task_to_goal.execute({
      taskNumber: 7,
      goalNumber: 1533,
    });
    expect(result.error).toContain("Could not attach #7");
  });

  it("removes the label and invalidates the cache on detach", async () => {
    const { tools, octokit } = makeTools();
    const result = await tools.detach_task_from_goal.execute({
      taskNumber: 7,
      goalId: "ship-v2",
    });
    expect(octokit.rest.issues.removeLabel).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      issue_number: 7,
      name: "goal:ship-v2",
    });
    expect(invalidateIssueCache).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ ok: true });
  });

  it("treats a 404 label removal as a no-op success", async () => {
    const octokit = makeOctokit();
    octokit.rest.issues.removeLabel.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    const { tools } = makeTools(octokit);
    const result = await tools.detach_task_from_goal.execute({
      taskNumber: 7,
      goalNumber: 1533,
    });
    expect(result).toMatchObject({ ok: true });
    expect(invalidateIssueCache).toHaveBeenCalledWith(7);
  });

  it("propagates non-404 removal failures as errors", async () => {
    const octokit = makeOctokit();
    octokit.rest.issues.removeLabel.mockRejectedValue(
      Object.assign(new Error("Server error"), { status: 500 }),
    );
    const { tools } = makeTools(octokit);
    const result = await tools.detach_task_from_goal.execute({
      taskNumber: 7,
      goalNumber: 1533,
    });
    expect(result).toEqual({ error: "Could not detach #7." });
  });
});
