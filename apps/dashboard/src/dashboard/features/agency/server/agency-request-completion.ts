import { completeAgencyRequestRun } from "@kody-ade/agency/agency-request-lifecycle";
import {
  listTodoFiles,
  writeTodoFile,
  type TodoFile,
} from "@kody-ade/workspace/todos/files";

interface CompletionInput {
  octokit: Parameters<typeof writeTodoFile>[0]["octokit"];
  workflowId: string;
  runId: string;
  loopId?: string;
  status: "success" | "failed" | "blocked";
  summary?: string;
}

export async function completeAgencyRequestsForWorkflow(
  input: CompletionInput,
): Promise<{ updated: number }> {
  const todos = await listTodoFiles();
  const bySlug = new Map<string, TodoFile>(
    todos.map((todo) => [todo.slug, todo]),
  );
  return completeAgencyRequestRun(input, {
    findByRun: async (runId, loopId) =>
      todos
        .filter(
          (todo) =>
            todo.agencyRequest?.related.some((ref) =>
              ref.kind === "run"
                ? ref.id === runId
                : ref.kind === "loop" && loopId
                  ? ref.id === loopId
                  : false,
            ) === true,
        )
        .map((todo) => ({
          slug: todo.slug,
          state: todo.agencyRequest!,
        })),
    save: async (slug, state) => {
      const todo = bySlug.get(slug);
      if (!todo) return;
      const done = state.phase === "done";
      await writeTodoFile({
        octokit: input.octokit,
        slug,
        title: todo.title,
        description: done
          ? "Kody completed this request and recorded its evidence."
          : state.phase === "blocked"
            ? "Kody stopped because the request needs attention."
            : todo.description,
        items: todo.items.map((item) =>
          done
            ? {
                ...item,
                completed: true,
                completedAt: item.completedAt ?? new Date().toISOString(),
              }
            : item,
        ),
        createdAt: todo.createdAt,
        frontmatter: todo.frontmatter,
        agencyRequest: state,
        sha: todo.sha,
      });
    },
  });
}
