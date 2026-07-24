import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  github: {
    getOwner: vi.fn(() => "acme"),
    getRepo: vi.fn(() => "widgets"),
  },
  backend: { query: vi.fn(), mutation: vi.fn() },
}));

vi.mock("@kody-ade/workspace/github", () => mocks.github);
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => mocks.backend,
}));
vi.mock("@kody-ade/backend/api", () => ({
  api: { repoDocs: { get: "get", save: "save" } },
}));

import {
  parseTodoFileContent,
  serializeTodoFileContent,
  writeTodoFile,
  type TodoFileContent,
} from "../../src/todos/files";

const createdAt = "2026-06-28T00:00:00.000Z";
const updatedAt = "2026-06-28T01:00:00.000Z";

const finiteTodo: TodoFileContent = {
  title: "Checkout work",
  outcome: "Checkout is verified.",
  status: "in-progress",
  evidence: ["Preview opened"],
  checklist: [{ id: "verify-cart", text: "Verify cart", done: false }],
  blockers: [],
  runIds: ["run-checkout"],
  createdAt,
  updatedAt,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backend.query.mockResolvedValue(null);
  mocks.backend.mutation.mockResolvedValue("todo-id");
});

describe("finite Todo documents", () => {
  it("round-trips the finite JSON shape without a version field", () => {
    const serialized = serializeTodoFileContent(finiteTodo);
    const parsed = parseTodoFileContent(serialized, "checkout-work", updatedAt);
    const stored = JSON.parse(serialized) as Record<string, unknown>;

    expect(stored).toEqual(finiteTodo);
    expect(stored).not.toHaveProperty("version");
    expect(parsed).toEqual(finiteTodo);
  });

  it("uses an empty finite shape for non-JSON legacy content", () => {
    const parsed = parseTodoFileContent(
      "---\ntitle: Legacy\n---\nOld markdown body.",
      "legacy-list",
      updatedAt,
    );

    expect(parsed).toMatchObject({
      title: "legacy-list",
      outcome: "",
      status: "todo",
      evidence: [],
      checklist: [],
      blockers: [],
      runIds: [],
    });
  });

  it("returns the Todo written to Convex", async () => {
    const todo = await writeTodoFile({
      octokit: {} as never,
      slug: "checkout-work",
      todo: finiteTodo,
    });

    expect(todo).toMatchObject({
      slug: "checkout-work",
      path: "todos/checkout-work.json",
      title: "Checkout work",
      outcome: "Checkout is verified.",
      checklist: [{ id: "verify-cart", done: false }],
    });
    expect(Date.parse(todo.updatedAt)).not.toBeNaN();
    expect(mocks.backend.mutation).toHaveBeenCalledTimes(1);
  });
});
