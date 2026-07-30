import { randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  isNestedGuidedFlowStep,
} from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import { rootGuidedFlowId } from "@kody-ade/kody-chat-dashboard/guided-flows/composition";
import { guidedFlowDefinitionForReference } from "@kody-ade/kody-chat-dashboard/guided-flows/definitions";
import {
  guidedFlowInstanceFromRow,
  guidedFlowInstanceWriteFields,
  type GuidedFlowStoredInstance,
} from "@kody-ade/kody-chat-dashboard/guided-flows/persistence";
import {
  buildGuidedFlowView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import { startGuidedFlowRuntime } from "@kody-ade/kody-chat-dashboard/guided-flows/runtime";
import {
  latestAvailableGuidedFlowDefinitions,
  parseGuidedFlowDefinitionRows,
  type StoredGuidedFlowDefinition,
} from "@kody-ade/kody-chat-dashboard/guided-flows/stored";
import { getBuiltinViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/builtin";
import { readViewRendererDefinitionFile } from "../../../../../src/dashboard/lib/view-renderers/standalone-renderer-store";
import type { ViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/definition";
import type { GuidedFlowDefinition } from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import type { RenderedViewDirective } from "../../../../../src/dashboard/lib/chat-ui-actions";

interface GuidedFlowToolContext {
  tenantId: string;
  actorId: string;
}

type GuidedFlowRow = GuidedFlowStoredInstance;

/** Custom flows live in userState — the same source the guided-flows route uses. */
async function customGuidedFlowDefinitions(
  client: ReturnType<typeof createBackendClient>,
  ctx: GuidedFlowToolContext,
): Promise<StoredGuidedFlowDefinition[]> {
  const rows = await client.query(backendApi.guidedFlows.listDefinitions, {
    tenantId: ctx.tenantId,
  });
  return parseGuidedFlowDefinitionRows(rows);
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
        .flatMap((step) =>
          isNestedGuidedFlowStep(step) ? [] : [step.rendererSlug],
        )
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
        const customDefinitions = await customGuidedFlowDefinitions(
          client,
          ctx,
        );
        const definition =
          getGuidedFlowDefinition(flowId) ??
          latestAvailableGuidedFlowDefinitions(customDefinitions).find(
            (candidate) => candidate.id === flowId,
          );
        if (!definition) return { error: `Unknown GuidedFlow "${flowId}"` };

        const active = (await client.query(backendApi.guidedFlows.listActive, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
        })) as GuidedFlowRow[];
        const existing = active.find(
          (row) =>
            rootGuidedFlowId(guidedFlowInstanceFromRow(row)) === flowId &&
            (row.instanceKey ?? "") === (instanceKey ?? ""),
        );
        if (existing) {
          const existingDefinition = guidedFlowDefinitionForReference(
            existing.flowId,
            existing.flowVersion,
            customDefinitions,
          );
          if (!existingDefinition) {
            return { error: "GuidedFlow definition is unavailable" };
          }
          return buildGuidedFlowView(
            existingDefinition,
            guidedFlowInstanceFromRow(existing),
            await customRenderersFor(ctx.tenantId, existingDefinition),
          );
        }

        const entered = startGuidedFlowRuntime({
          definition,
          instanceId: randomUUID(),
          instanceKey,
          resolveDefinition: (nestedFlowId, nestedFlowVersion) =>
            guidedFlowDefinitionForReference(
              nestedFlowId,
              nestedFlowVersion,
              customDefinitions,
            ),
        });
        await client.mutation(backendApi.guidedFlows.upsert, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          ...guidedFlowInstanceWriteFields(entered.instance),
          updatedAt: new Date().toISOString(),
        });
        return buildGuidedFlowView(
          entered.definition,
          entered.instance,
          await customRenderersFor(ctx.tenantId, entered.definition),
        );
      },
    }),
  };
}
