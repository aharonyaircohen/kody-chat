import {
  createAgencyRequestState,
  type LoopDefinition,
} from "@kody-ade/agency-domain";
import { v } from "convex/values";

import { serviceQuery as query } from "./lib/auth";

const TODO_PREFIX = "todo:";
const LOOP_PREFIX = "agency-request-";

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const records = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q
          .eq("tenantId", tenantId)
          .gte("kind", TODO_PREFIX)
          .lt("kind", `${TODO_PREFIX}￿`),
      )
      .take(100);

    const loops: LoopDefinition[] = [];
    for (const record of records) {
      const doc =
        record.doc &&
        typeof record.doc === "object" &&
        !Array.isArray(record.doc)
          ? (record.doc as Record<string, unknown>)
          : null;
      if (!doc?.agencyRequest) continue;
      try {
        const request = createAgencyRequestState(doc.agencyRequest);
        if (
          !request.execution ||
          !["running", "monitoring", "blocked"].includes(request.phase)
        ) {
          continue;
        }
        const loop = request.related.find(
          (ref) => ref.kind === "loop" && ref.id.startsWith(LOOP_PREFIX),
        );
        if (!loop) continue;
        const latestRun = [...request.related]
          .reverse()
          .find((ref) => ref.kind === "run");
        if (latestRun) {
          const workflowRun = await ctx.db
            .query("workflowRuns")
            .withIndex("by_run", (q) =>
              q
                .eq("tenantId", tenantId)
                .eq("workflowId", request.execution!.workflowId)
                .eq("runId", latestRun.id),
            )
            .unique();
          if (
            (!workflowRun && request.phase !== "blocked") ||
            workflowRun?.state.status === "running" ||
            workflowRun?.state.status === "done"
          ) {
            continue;
          }
        }
        loops.push({
          id: loop.id,
          trigger: { type: "schedule" as const, every: "15m" },
          target: {
            kind: "workflow" as const,
            id: request.execution.workflowId,
          },
          input: request.execution.input,
          enabled: true,
        });
      } catch {
        continue;
      }
    }
    return loops;
  },
});
