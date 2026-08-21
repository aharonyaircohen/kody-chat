import { describe, expect, it } from "vitest";

import {
  createToolExecutionCoordinator,
  isReadOnlyToolName,
} from "../../../app/api/kody/chat/kody/tool-execution-order";

describe("tool execution ordering", () => {
  it("waits for an earlier mutation before a dependent read", async () => {
    const coordinator = createToolExecutionCoordinator();
    const events: string[] = [];
    let releaseDelete!: () => void;
    const deleteFinished = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });

    const deleteTodo = coordinator.wrap("delete_todo_list", async () => {
      events.push("delete:start");
      await deleteFinished;
      events.push("delete:end");
      return { success: true };
    });
    const listTodos = coordinator.wrap("list_todo_lists", async () => {
      events.push("list");
      return { todos: [] };
    });

    const deletePromise = deleteTodo({});
    const listPromise = listTodos({});
    await Promise.resolve();

    expect(events).toEqual(["delete:start"]);
    releaseDelete();
    await Promise.all([deletePromise, listPromise]);

    expect(events).toEqual(["delete:start", "delete:end", "list"]);
  });

  it("keeps independent reads concurrent", async () => {
    const coordinator = createToolExecutionCoordinator();
    let releaseReads!: () => void;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    let started = 0;

    const firstRead = coordinator.wrap("list_todo_lists", async () => {
      started += 1;
      await readsReleased;
      return { todos: [] };
    });
    const secondRead = coordinator.wrap("read_todo_list", async () => {
      started += 1;
      await readsReleased;
      return { todo: null };
    });

    const firstPromise = firstRead({});
    const secondPromise = secondRead({});
    await Promise.resolve();
    expect(started).toBe(2);
    releaseReads();
    await Promise.all([firstPromise, secondPromise]);
  });

  it("treats writes as mutations by default", () => {
    expect(isReadOnlyToolName("list_todo_lists")).toBe(true);
    expect(isReadOnlyToolName("read_todo_list")).toBe(true);
    expect(isReadOnlyToolName("delete_todo_list")).toBe(false);
    expect(isReadOnlyToolName("github_comment_on_issue")).toBe(false);
  });
});
