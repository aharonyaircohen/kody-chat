import { randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  createGuidedFlowInstance,
  type GuidedFlowInstance,
} from "@kody-ade/kody-chat/guided-flows/controller";
import {
  buildGuidedFlowView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat/guided-flows/registry";
import {
  latestAvailableGuidedFlowDefinitions,
  parseGuidedFlowDefinitionRows,
} from "@kody-ade/kody-chat/guided-flows/stored";
import { getBuiltinViewRendererDefinition } from "@dashboard/lib/view-renderers/builtin";
import { readViewRendererDefinitionFile } from "@dashboard/lib/view-renderers/renderers";
import type { ViewRendererDefinition } from "@dashboard/lib/view-renderers/definition";
import type { GuidedFlowDefinition } from "@kody-ade/kody-chat/guided-flows/controller";
import type { RenderedViewDirective } from "@dashboard/lib/chat-ui-actions";

interface GuidedFlowToolContext {
  tenantId: string;
  actorId: string;
}

type GuidedFlowRow = {
  instanceId: string;
  instanceKey?: string;
  flowId: string;
  flowVersion: number;
  currentStepId: string;
  status: "active" | "completed" | "cancelled";
  revision: number;
  data: unknown;
  history: string[];
};

function toInstance(row: GuidedFlowRow): GuidedFlowInstance {
  return {
    instanceId: row.instanceId,
    ...(row.instanceKey ? { instanceKey: row.instanceKey } : {}),
    flowId: row.flowId,
    flowVersion: row.flowVersion,
    currentStepId: row.currentStepId,
    status: row.status,
    revision: row.revision,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {},
    history: row.history,
  };
}

/** Custom flows live in userState — the same source the guided-flows route uses. */
async function customGuidedFlowDefinition(
  client: ReturnType<typeof createBackendClient>,
  ctx: GuidedFlowToolContext,
  flowId: string,
): Promise<GuidedFlowDefinition | undefined> {
  const rows = await client.query(backendApi.guidedFlows.listDefinitions, {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
  });
  return latestAvailableGuidedFlowDefinitions(
    parseGuidedFlowDefinitionRows(rows),
  ).find((definition) => definition.id === flowId);
}

/** Non-builtin renderers a definition needs, from the tenant renderer store. */
async function customRenderersFor(
  tenantId: string,
  definition: GuidedFlowDefinition,
): Promise<Record<string, ViewRendererDefinition>> {
  const [owner, repo] = tenantId.split("/");
  const out: Record<string, ViewRendererDefinition> = {};
  if (!owner || !repo) return out;
  const slugs = [
    ...new Set(
      definition.steps
        .map((step) => step.rendererSlug)
        .filter((slug) => !getBuiltinViewRendererDefinition(slug)),
    ),
  ];
  for (const slug of slugs) {
    const file = await readViewRendererDefinitionFile({ owner, repo, slug });
    if (file) out[slug] = file.definition;
  }
  return out;
}

export function createGuidedFlowTools(ctx: GuidedFlowToolContext): ToolSet {
  const knownFlowIds = listGuidedFlowDefinitions()
    .map((definition) => definition.id)
    .join(", ");

  return {
    guided_flow_start: tool({
      description:
        "Start or resume a GuidedFlow for the user. Use only when the user " +
        "explicitly asks for step-by-step help with a supported task. " +
        `Built-in flow ids: ${knownFlowIds}. Custom flows defined in this ` +
        "repo can also be started by id. The result is the first interactive step.",
      inputSchema: z.object({
        flowId: z.string().trim().min(1).max(80),
        instanceKey: z.string().trim().min(1).max(128).optional(),
      }),
      execute: async ({
        flowId,
        instanceKey,
      }): Promise<RenderedViewDirective | { error: string }> => {
        const client = createBackendClient();
        const definition =
          getGuidedFlowDefinition(flowId) ??
          (await customGuidedFlowDefinition(client, ctx, flowId));
        if (!definition) return { error: `Unknown GuidedFlow "${flowId}"` };

        const active = (await client.query(backendApi.guidedFlows.listActive, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
        })) as GuidedFlowRow[];
        const existing = active.find(
          (row) =>
            row.flowId === flowId &&
            (row.instanceKey ?? "") === (instanceKey ?? ""),
        );
        if (existing) {
          return buildGuidedFlowView(
            definition,
            toInstance(existing),
            await customRenderersFor(ctx.tenantId, definition),
          );
        }

        const instance = createGuidedFlowInstance(
          definition,
          randomUUID(),
          instanceKey,
        );
        await client.mutation(backendApi.guidedFlows.upsert, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          instanceId: instance.instanceId,
          instanceKey,
          flowId: instance.flowId,
          flowVersion: instance.flowVersion,
          currentStepId: instance.currentStepId,
          status: instance.status,
          revision: instance.revision,
          data: instance.data,
          history: [...instance.history],
          updatedAt: new Date().toISOString(),
        });
        return buildGuidedFlowView(
          definition,
          instance,
          await customRenderersFor(ctx.tenantId, definition),
        );
      },
    }),
  };
}
