import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTodoTools } from "../../app/api/kody/chat/tools/todo-tools";

const ctx = {
  owner: "acme",
  repo: "app",
  listTodos: vi.fn(),
  readTodo: vi.fn(),
  saveTodo: vi.fn(),
  removeTodo: vi.fn(),
};

describe("todo chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.listTodos.mockResolvedValue({ todos: [] });
    ctx.readTodo.mockResolvedValue({ todo: { slug: "launch" } });
    ctx.saveTodo.mockResolvedValue({ todo: { slug: "launch" } });
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
    await tools.delete_todo_list.execute!({ slug: "launch" }, {} as never);

    expect(ctx.listTodos).toHaveBeenCalledOnce();
    expect(ctx.readTodo).toHaveBeenCalledWith("launch");
    expect(ctx.saveTodo).toHaveBeenCalledWith({
      slug: "launch",
      title: "Launch",
      description: "Ship safely.",
      items: [],
    });
    expect(ctx.removeTodo).toHaveBeenCalledWith("launch");
  });
});
