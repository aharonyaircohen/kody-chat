import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  requireKodyAuth,
  verifyActorLogin,
  verifyRepoWriteAccess,
} from "@kody-ade/base/auth";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { type GuidedFlowDefinition } from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import { GuidedFlowCompositionError } from "@kody-ade/kody-chat-dashboard/guided-flows/composition";
import {
  guidedFlowDefinitionForInstance,
  guidedFlowDefinitionForReference,
} from "@kody-ade/kody-chat-dashboard/guided-flows/definitions";
import {
  guidedFlowInstanceFromRow,
  guidedFlowInstanceWriteFields,
  type GuidedFlowStoredInstance,
} from "@kody-ade/kody-chat-dashboard/guided-flows/persistence";
import { runGuidedFlowAction } from "@kody-ade/kody-chat-dashboard/guided-flows/runtime";
import type { StoredGuidedFlowDefinition } from "@kody-ade/kody-chat-dashboard/guided-flows/stored";
import { sanitizeGuidedFlowData } from "@kody-ade/kody-chat-dashboard/guided-flows/safe-data";
import {
  availableGuidedFlowDefinitions,
  loadGuidedFlowRenderers,
  loadStoredGuidedFlowDefinitions,
} from "./catalog";
import {
  bindExistingGuidedFlow,
  startOrResumeGuidedFlow,
} from "./runtime-service";
import {
  GuidedFlowCompletionError,
  processGuidedFlowCompletionEffects,
} from "./completion-effects";
import { presentGuidedFlow } from "./presenter";
import {
  archiveGuidedFlowDefinition,
  saveGuidedFlowDefinition,
} from "./definition-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const getConvexClient = createBackendClient;

function tenantIdFor(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const startSchema = z.object({
  action: z.literal("start"),
  flowId: z.string().trim().min(1).max(80),
  instanceKey: z.string().trim().min(1).max(128).optional(),
  actorLogin: z.string().trim().min(1).max(200).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
});

const bindSchema = z.object({
  action: z.literal("bind"),
  instanceId: z.string().trim().min(1).max(128),
  conversationId: z.string().trim().min(1).max(128),
});

const definitionDraftViewStepSchema = z.object({
  type: z.literal("view").optional(),
  title: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(1).max(1_000),
  rendererSlug: z.string().trim().min(1).max(80),
  rendererVersion: z.number().int().positive().optional(),
  rendererGoal: z.string().trim().max(1_000).optional(),
  rendererData: z.record(z.string(), z.unknown()).optional(),
});

const definitionDraftNestedStepSchema = z.object({
  type: z.literal("flow"),
  title: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(1).max(1_000),
  flowId: z.string().trim().min(1).max(80),
  flowVersion: z.number().int().positive(),
});

const definitionDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  completionRouteId: z.string().trim().max(80).optional(),
  steps: z
    .array(
      z.union([definitionDraftNestedStepSchema, definitionDraftViewStepSchema]),
    )
    .min(1)
    .max(20),
});

const createDefinitionSchema = z.object({
  action: z.literal("create-definition"),
  draft: definitionDraftSchema,
});

const updateDefinitionSchema = z.object({
  action: z.literal("update-definition"),
  flowId: z.string().trim().min(1).max(80),
  draft: definitionDraftSchema,
});

const deleteDefinitionSchema = z.object({
  action: z.literal("delete-definition"),
  flowId: z.string().trim().min(1).max(80),
});

const changeSchema = z.object({
  action: z.enum(["submit", "back", "cancel"]),
  instanceId: z.string().trim().min(1).max(128),
  stepId: z.string().trim().min(1).max(80).optional(),
  actionId: z.string().trim().min(1).max(80).optional(),
  expectedRevision: z.number().int().nonnegative(),
  result: z.record(z.string(), z.unknown()).optional(),
  mutationId: z.string().trim().min(1).max(128),
});

type GuidedFlowRow = GuidedFlowStoredInstance & {
  tenantId: string;
  actorId: string;
  updatedAt: string;
  mutationId?: string;
};

function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}

function requireRepo(req: NextRequest) {
  const auth = getRequestAuth(req);
  if (!auth) return json({ error: "missing_repo_context" }, { status: 400 });
  return auth;
}

async function actorFor(req: NextRequest, actorLogin?: string) {
  const actor = await verifyActorLogin(req, actorLogin);
  if (actor instanceof NextResponse) return actor;
  return actor.identity.login;
}

function definitionForRow(
  row: GuidedFlowRow,
  customDefinitions: readonly StoredGuidedFlowDefinition[] = [],
): GuidedFlowDefinition {
  return guidedFlowDefinitionForInstance(row, customDefinitions);
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = requireRepo(req);
  if (auth instanceof NextResponse) return auth;
  const actor = await actorFor(req);
  if (actor instanceof NextResponse) return actor;

  try {
    const customDefinitions = await loadStoredGuidedFlowDefinitions(
      getConvexClient(),
      tenantIdFor(auth.owner, auth.repo),
    );
    if (new URL(req.url).searchParams.get("view") === "templates") {
      return json({
        definitions: availableGuidedFlowDefinitions(customDefinitions),
      });
    }
    const instanceId = new URL(req.url).searchParams.get("instanceId");
    if (instanceId) {
      const row = (await getConvexClient().query(backendApi.guidedFlows.get, {
        tenantId: tenantIdFor(auth.owner, auth.repo),
        actorId: actor,
        instanceId,
      })) as GuidedFlowRow | null;
      if (!row)
        return json({ error: "guided_flow_not_found" }, { status: 404 });
      const definition = definitionForRow(row, customDefinitions);
      return json({
        flow: presentGuidedFlow(
          definition,
          guidedFlowInstanceFromRow(row),
          await loadGuidedFlowRenderers(tenantIdFor(auth.owner, auth.repo), [
            definition,
          ]),
        ),
      });
    }

    const rows = (await getConvexClient().query(backendApi.guidedFlows.list, {
      tenantId: tenantIdFor(auth.owner, auth.repo),
      actorId: actor,
    })) as GuidedFlowRow[];
    const listRenderers = await loadGuidedFlowRenderers(
      tenantIdFor(auth.owner, auth.repo),
      rows.flatMap((row) => {
        try {
          return [definitionForRow(row, customDefinitions)];
        } catch {
          return [];
        }
      }),
    );
    const flows = rows.flatMap((row) => {
      try {
        const definition = definitionForRow(row, customDefinitions);
        return [
          presentGuidedFlow(
            definition,
            guidedFlowInstanceFromRow(row),
            listRenderers,
          ),
        ];
      } catch {
        return [];
      }
    });
    return json({
      flows,
      definitions: availableGuidedFlowDefinitions(customDefinitions),
    });
  } catch (error) {
    console.error("[GuidedFlows] list failed", error);
    return json({ error: "guided_flows_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = requireRepo(req);
  if (auth instanceof NextResponse) return auth;
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 100_000) {
    return json({ error: "request_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const action = (body as { action?: unknown } | null)?.action;
  const parsed =
    action === "start"
      ? startSchema.safeParse(body)
      : action === "bind"
        ? bindSchema.safeParse(body)
        : action === "create-definition"
          ? createDefinitionSchema.safeParse(body)
          : action === "update-definition"
            ? updateDefinitionSchema.safeParse(body)
            : action === "delete-definition"
              ? deleteDefinitionSchema.safeParse(body)
              : changeSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "validation_error", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const changesDefinition =
    parsed.data.action === "create-definition" ||
    parsed.data.action === "update-definition" ||
    parsed.data.action === "delete-definition";
  const actorResult = changesDefinition
    ? await verifyRepoWriteAccess(req)
    : await actorFor(
        req,
        parsed.data.action === "start" ? parsed.data.actorLogin : undefined,
      );
  if (actorResult instanceof NextResponse) return actorResult;
  const actor =
    typeof actorResult === "string" ? actorResult : actorResult.actorLogin;
  const tenantId = tenantIdFor(auth.owner, auth.repo);
  const client = getConvexClient();

  try {
    if (
      parsed.data.action === "create-definition" ||
      parsed.data.action === "update-definition"
    ) {
      const input = parsed.data;
      const result = await saveGuidedFlowDefinition(client, {
        tenantId,
        mode: input.action === "update-definition" ? "update" : "create",
        ...(input.action === "update-definition"
          ? { flowId: input.flowId }
          : {}),
        draft: input.draft,
      });
      return result.ok
        ? json({ definition: result.definition }, { status: result.status })
        : json({ error: result.error }, { status: result.status });
    }

    if (parsed.data.action === "delete-definition") {
      const input = parsed.data as z.infer<typeof deleteDefinitionSchema>;
      const result = await archiveGuidedFlowDefinition(client, {
        tenantId,
        flowId: input.flowId,
      });
      return result.ok
        ? json({ deleted: input.flowId })
        : json({ error: result.error }, { status: result.status });
    }

    if (parsed.data.action === "start") {
      const start = parsed.data as z.infer<typeof startSchema>;
      const selected = await startOrResumeGuidedFlow(client, {
        tenantId,
        actorId: actor,
        flowId: start.flowId,
        instanceKey: start.instanceKey,
        conversationId: start.conversationId,
      });
      if (!selected)
        return json({ error: "unknown_guided_flow" }, { status: 404 });
      return json(
        presentGuidedFlow(
          selected.definition,
          selected.instance,
          await loadGuidedFlowRenderers(tenantId, [selected.definition]),
        ),
        { status: selected.created ? 201 : 200 },
      );
    }

    if (parsed.data.action === "bind") {
      const selected = await bindExistingGuidedFlow(client, {
        tenantId,
        actorId: actor,
        conversationId: parsed.data.conversationId,
        instanceId: parsed.data.instanceId,
      });
      if (!selected)
        return json({ error: "guided_flow_not_found" }, { status: 404 });
      return json(
        presentGuidedFlow(
          selected.definition,
          selected.instance,
          await loadGuidedFlowRenderers(tenantId, [selected.definition]),
        ),
      );
    }

    const instanceRow = (await client.query(backendApi.guidedFlows.get, {
      tenantId,
      actorId: actor,
      instanceId: parsed.data.instanceId,
    })) as GuidedFlowRow | null;
    if (!instanceRow)
      return json({ error: "guided_flow_not_found" }, { status: 404 });
    const customDefinitions = await loadStoredGuidedFlowDefinitions(
      client,
      tenantId,
    );
    let definition = definitionForRow(instanceRow, customDefinitions);
    const current = guidedFlowInstanceFromRow(instanceRow);
    if (instanceRow.mutationId === parsed.data.mutationId) {
      const effectResult = await processGuidedFlowCompletionEffects(
        req,
        client,
        {
          tenantId,
          actorId: actor,
          instanceId: current.instanceId,
        },
      );
      return json({
        ...presentGuidedFlow(
          definition,
          current,
          await loadGuidedFlowRenderers(tenantId, [definition]),
        ),
        ...effectResult,
      });
    }
    if (current.revision !== parsed.data.expectedRevision) {
      return json({ error: "revision_conflict" }, { status: 409 });
    }
    if (
      parsed.data.action === "submit" &&
      parsed.data.stepId !== current.currentStepId
    ) {
      return json({ error: "step_conflict" }, { status: 409 });
    }
    const submittedFlow = {
      flowId: definition.id,
      flowVersion: definition.version,
      stepId: current.currentStepId,
    };
    const runtime = runGuidedFlowAction({
      definition,
      instance: current,
      action: parsed.data.action,
      actionId: parsed.data.actionId,
      result: parsed.data.result,
      resolveDefinition: (flowId, flowVersion) =>
        guidedFlowDefinitionForReference(
          flowId,
          flowVersion,
          customDefinitions,
        ),
    });
    definition = runtime.definition;
    const next = runtime.instance;

    if (
      JSON.stringify({
        data: next.data,
        output: next.output,
        stack: next.stack,
      }).length > 20_000
    ) {
      return json({ error: "guided_flow_data_too_large" }, { status: 413 });
    }

    const completedAt = new Date().toISOString();
    await client.mutation(backendApi.guidedFlows.update, {
      tenantId,
      actorId: actor,
      expectedRevision: current.revision,
      ...guidedFlowInstanceWriteFields(next),
      updatedAt: new Date().toISOString(),
      mutationId: parsed.data.mutationId,
      ...(parsed.data.action === "submit"
        ? {
            submission: {
              ...submittedFlow,
              actionId: parsed.data.actionId ?? "",
              result: sanitizeGuidedFlowData(parsed.data.result),
              submittedAt: new Date().toISOString(),
            },
          }
        : {}),
      ...(runtime.completed.length > 0
        ? {
            completions: runtime.completed.map((completed) => ({
              effectId: `${next.instanceId}:${completed.definition.id}@${completed.definition.version}:${completed.instance.revision}`,
              flowId: completed.definition.id,
              flowVersion: completed.definition.version,
              completedAt,
              data: completed.instance.data,
            })),
          }
        : {}),
    });
    const effectResult = await processGuidedFlowCompletionEffects(req, client, {
      tenantId,
      actorId: actor,
      instanceId: next.instanceId,
    });
    return json({
      ...presentGuidedFlow(
        definition,
        next,
        await loadGuidedFlowRenderers(tenantId, [definition]),
      ),
      ...effectResult,
    });
  } catch (error) {
    if (error instanceof GuidedFlowCompletionError) {
      return json({ error: error.code }, { status: error.status });
    }
    if (error instanceof GuidedFlowCompositionError) {
      return json({ error: error.code }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "GuidedFlow action failed";
    if (message.includes("guided_flow_already_exists")) {
      return json({ error: "guided_flow_already_exists" }, { status: 409 });
    }
    if (message.includes("guided_flow_not_found")) {
      return json({ error: "guided_flow_not_found" }, { status: 404 });
    }
    if (message.includes("not active") || message.includes("already at")) {
      return json({ error: "invalid_guided_flow_transition" }, { status: 409 });
    }
    console.error("[GuidedFlows] action failed", error);
    return json({ error: "guided_flow_action_failed" }, { status: 500 });
  }
}
