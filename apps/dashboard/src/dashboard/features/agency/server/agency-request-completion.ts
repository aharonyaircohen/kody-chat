import { completeAgencyRequestRun } from "@kody-ade/agency/agency-request-lifecycle";
import {
  listTodoFiles,
  writeTodoFile,
  type TodoFile,
} from "@kody-ade/workspace/todos/files";
import { createAgencyRequestState } from "@kody-ade/agency-domain";
import { writeReportRun } from "@dashboard/lib/reports-files";
import {
  agencyRequestReportSlug,
  buildAgencyRequestCompletionReport,
} from "./agency-request-report";

interface CompletionInput {
  octokit: Parameters<typeof writeTodoFile>[0]["octokit"];
  workflowId: string;
  runId: string;
  loopId?: string;
  status: "success" | "failed" | "blocked";
  summary?: string;
  output?: Readonly<Record<string, unknown>>;
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
    verify: async (record) => {
      const verification = input.output?.agencyVerification;
      if (
        verification &&
        typeof verification === "object" &&
        !Array.isArray(verification)
      ) {
        const value = verification as {
          passed?: unknown;
          evidence?: unknown;
        };
        if (typeof value.passed === "boolean") {
          return {
            passed: value.passed,
            evidence:
              typeof value.evidence === "string" && value.evidence.trim()
                ? value.evidence.trim().slice(0, 2_000)
                : value.passed
                  ? "Workflow supplied verified success evidence."
                  : "Workflow reported that the saved success criteria are not met.",
          };
        }
      }
      return {
        passed: false,
        evidence: record.state.requirement.success
          ? `No verification evidence was returned for: ${record.state.requirement.success}`
          : "No end-to-end verification evidence was returned.",
      };
    },
    save: async (slug, state) => {
      const todo = bySlug.get(slug);
      if (!todo) return;
      const done = state.phase === "done";
      let savedState = state;
      let description = todo.description;
      if (done) {
        const reportSlug = agencyRequestReportSlug(slug);
        await writeReportRun({
          slug: reportSlug,
          runId: input.runId,
          title: `${todo.title} - completion`,
          body: buildAgencyRequestCompletionReport({
            todo,
            state,
            workflowId: input.workflowId,
            runId: input.runId,
            status: input.status,
            ...(input.summary ? { summary: input.summary } : {}),
            ...(input.output ? { output: input.output } : {}),
          }),
          generatedAt: new Date().toISOString(),
        });
        savedState = createAgencyRequestState({
          ...state,
          related: [
            ...state.related.filter((ref) => ref.kind !== "report"),
            { kind: "report", id: reportSlug },
          ],
        });
        description = `Kody completed this request and recorded its evidence.\n\n[Open the completion report](/reports/${reportSlug})`;
      }
      await writeTodoFile({
        octokit: input.octokit,
        slug,
        title: todo.title,
        description: done
          ? description
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
        agencyRequest: savedState,
        sha: todo.sha,
      });
    },
  });
}
