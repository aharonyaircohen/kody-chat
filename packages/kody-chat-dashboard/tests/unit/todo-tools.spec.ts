import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTodoTools } from "../../app/api/kody/chat/tools/todo-tools";

const ctx = {
  owner: "acme",
  repo: "app",
  listTodos: vi.fn(),
  readTodo: vi.fn(),
  saveTodo: vi.fn(),
  patchTodo: vi.fn(),
  validateAgencyExecution: vi.fn(),
  runAgencyRequest: vi.fn(),
  removeTodo: vi.fn(),
};

describe("todo chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.listTodos.mockResolvedValue({ todos: [] });
    ctx.readTodo.mockResolvedValue({ todo: { slug: "launch" } });
    ctx.saveTodo.mockResolvedValue({ todo: { slug: "launch" } });
    ctx.patchTodo.mockResolvedValue({ todo: { slug: "launch" } });
    ctx.validateAgencyExecution.mockImplementation(async (execution) => ({
      execution,
      issues: [],
    }));
    ctx.runAgencyRequest.mockResolvedValue({ runId: "run-1" });
    ctx.removeTodo.mockResolvedValue({ success: true });
  });

  it("uses the same Dashboard Todo API for the full lifecycle", async () => {
    const tools = createTodoTools(ctx as never);

    await tools.list_todo_lists.execute!({}, {} as never);
    await tools.read_todo_list.execute!({ slug: "launch" }, {} as never);
    await tools.create_or_update_todo_list.execute!(
      {
        slug: "launch",
        title: "Launch",
        description: "Ship safely.",
        items: [],
      },
      {} as never,
    );
    await tools.update_agency_request.execute!(
      {
        slug: "launch",
        agencyRequest: {
          phase: "waiting-approval",
          source: {
            kind: "guided-flow",
            instanceId: "flow-1",
            effectId: "effect-1",
          },
          requirement: { outcome: "Ship safely" },
          questions: [],
          plan: ["Run the release workflow"],
          execution: { workflowId: "release", input: {} },
          evidence: [],
          blockers: [],
          related: [{ kind: "workflow", id: "release" }],
        },
      },
      {} as never,
    );
    await tools.run_agency_request.execute!({ slug: "launch" }, {} as never);
    await tools.delete_todo_list.execute!({ slug: "launch" }, {} as never);

    expect(ctx.listTodos).toHaveBeenCalledOnce();
    expect(ctx.readTodo).toHaveBeenCalledWith("launch");
    expect(ctx.saveTodo).toHaveBeenCalledWith({
      slug: "launch",
      title: "Launch",
      description: "Ship safely.",
      items: [],
    });
    expect(
      await tools.create_or_update_todo_list.execute!(
        { slug: "launch", title: "Launch", items: [] },
        {} as never,
      ),
    ).toMatchObject({
      internalLinks: [
        {
          href: "/repo/acme/app/todos/launch",
          label: "Open todo: launch",
        },
      ],
    });
    expect(ctx.patchTodo).toHaveBeenCalledWith("launch", {
      agencyRequest: expect.objectContaining({ phase: "waiting-approval" }),
    });
    expect(ctx.runAgencyRequest).toHaveBeenCalledWith("launch");
    expect(ctx.removeTodo).toHaveBeenCalledWith("launch");
  });

  it("refuses approval state without an executable Workflow contract", async () => {
    const tools = createTodoTools(ctx as never);
    const result = await tools.update_agency_request.execute!(
      {
        slug: "launch",
        agencyRequest: {
          phase: "waiting-approval",
          source: {
            kind: "guided-flow",
            instanceId: "flow-1",
            effectId: "effect-1",
          },
          requirement: { outcome: "Ship safely" },
          questions: [],
          plan: ["Run release"],
          evidence: [],
          blockers: [],
          related: [],
        },
      },
      {} as never,
    );

    expect(result).toEqual({
      error:
        "waiting-approval requires execution.workflowId and validated input",
    });
    expect(ctx.patchTodo).not.toHaveBeenCalled();
  });

  it("refuses approval state when the saved input does not match the Workflow schema", async () => {
    ctx.validateAgencyExecution.mockImplementation(async (execution) => ({
      execution,
      issues: ["input.ciRunId: Expected number, received string"],
    }));
    const tools = createTodoTools(ctx as never);

    const result = await tools.update_agency_request.execute!(
      {
        slug: "launch",
        agencyRequest: {
          phase: "waiting-approval",
          source: {
            kind: "guided-flow",
            instanceId: "flow-1",
            effectId: "effect-1",
          },
          requirement: { outcome: "Repair CI" },
          questions: [],
          plan: ["Run CI Repair"],
          execution: {
            workflowId: "ci-repair",
            input: { ciRunId: "31714049933" },
          },
          evidence: [],
          blockers: [],
          related: [{ kind: "workflow", id: "ci-repair" }],
        },
      },
      {} as never,
    );

    expect(result).toEqual({
      error:
        "Agency execution is invalid: input.ciRunId: Expected number, received string",
    });
    expect(ctx.patchTodo).not.toHaveBeenCalled();
  });

  it("stores the schema-normalized execution input before approval", async () => {
    ctx.validateAgencyExecution.mockResolvedValue({
      execution: {
        workflowId: "ci-repair",
        input: { ciRunId: 31714049933 },
      },
      issues: [],
    });
    const tools = createTodoTools(ctx as never);

    await tools.update_agency_request.execute!(
      {
        slug: "launch",
        agencyRequest: {
          phase: "waiting-approval",
          source: {
            kind: "guided-flow",
            instanceId: "flow-1",
            effectId: "effect-1",
          },
          requirement: { outcome: "Repair CI" },
          questions: [],
          plan: ["Run CI Repair"],
          execution: {
            workflowId: "ci-repair",
            input: { ciRunId: "31714049933" },
          },
          evidence: [],
          blockers: [],
          related: [{ kind: "workflow", id: "ci-repair" }],
        },
      },
      {} as never,
    );

    expect(ctx.patchTodo).toHaveBeenCalledWith(
      "launch",
      expect.objectContaining({
        agencyRequest: expect.objectContaining({
          execution: {
            workflowId: "ci-repair",
            input: { ciRunId: 31714049933 },
          },
        }),
      }),
    );
  });
});
