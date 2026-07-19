import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  advanceGuidedFlow,
  cancelGuidedFlow,
  createGuidedFlowInstance,
  goBackGuidedFlow,
  type GuidedFlowDefinition,
  type GuidedFlowInstance,
} from "@kody-ade/kody-chat/guided-flows/controller";
import {
  buildGuidedFlowView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat/guided-flows/registry";
import {
  buildGuidedFlowDefinition,
  type GuidedFlowDraft,
} from "@kody-ade/kody-chat/guided-flows/authoring";
import { resolveDashboardNavigationTarget } from "@dashboard/lib/dashboard-navigation";

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
});

const definitionDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  completionRouteId: z.string().trim().max(80).optional(),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        explanation: z.string().trim().min(1).max(1_000),
        rendererSlug: z.string().trim().min(1).max(80),
      }),
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

type GuidedFlowRow = {
  tenantId: string;
  actorId: string;
  instanceId: string;
  instanceKey?: string;
  flowId: string;
  flowVersion: number;
  currentStepId: string;
  status: "active" | "completed" | "cancelled";
  revision: number;
  data: unknown;
  history: string[];
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

function definitionForRow(
  row: GuidedFlowRow,
  customDefinitions: readonly GuidedFlowDefinition[] = [],
): GuidedFlowDefinition {
  const definition =
    getGuidedFlowDefinition(row.flowId) ??
    customDefinitions.find((candidate) => candidate.id === row.flowId);
  if (!definition || definition.version !== row.flowVersion) {
    throw new Error("GuidedFlow definition is no longer available");
  }
  return definition;
}

async function customDefinitionsFor(
  client: ReturnType<typeof getConvexClient>,
  tenantId: string,
  actor: string,
): Promise<GuidedFlowDefinition[]> {
  const row = (await client.query(backendApi.userState.get, {
    tenantId,
    namespace: "guided-flow-definitions",
    userKey: actor,
  })) as { data?: unknown } | null;
  const definitions = row?.data;
  return Array.isArray(definitions)
    ? (definitions as GuidedFlowDefinition[])
    : [];
}

function navigationForCompletion(definition: GuidedFlowDefinition) {
  if (!definition.completionRouteId) return undefined;
  const resolved = resolveDashboardNavigationTarget({
    routeId: definition.completionRouteId,
    reason: `Open ${definition.title} results`,
  });
  if ("error" in resolved) throw new Error(resolved.error);
  return {
    action: "dashboard_navigate" as const,
    ...resolved,
  };
}

function responseFor(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
) {
  return {
    instance,
    flow: {
      id: definition.id,
      title: definition.title,
      stepIndex: Math.max(
        0,
        definition.steps.findIndex(
          (step) => step.id === instance.currentStepId,
        ),
      ),
      stepCount: definition.steps.length,
    },
    ...(instance.status === "active"
      ? { view: buildGuidedFlowView(definition, instance) }
      : { navigation: navigationForCompletion(definition) }),
  };
}

async function completeGuidedFlowEffect(
  req: NextRequest,
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  actor: string,
) {
  if (definition.id !== "create-workflow") return undefined;

  const input = z
    .object({
      workflowName: z.string().trim().min(1).max(160),
      capabilitySlug: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
      actionId: z.literal("approve"),
    })
    .safeParse(instance.data);
  if (!input.success) {
    throw new Error("GuidedFlow has incomplete workflow details");
  }

  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const response = await fetch(
    new URL("/api/kody/company/workflows", req.url),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: input.data.workflowName,
        capabilities: [input.data.capabilitySlug],
        actorLogin: actor,
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    workflow?: unknown;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.error ?? "Workflow creation failed",
    );
  }
  return payload.workflow;
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = requireRepo(req);
  if (auth instanceof NextResponse) return auth;
  const actor = await actorFor(req);
  if (actor instanceof NextResponse) return actor;

  try {
    const customDefinitions = await customDefinitionsFor(
      getConvexClient(),
      tenantIdFor(auth.owner, auth.repo),
      actor,
    );
    if (new URL(req.url).searchParams.get("view") === "templates") {
      return json({
        definitions: [...listGuidedFlowDefinitions(), ...customDefinitions],
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
      return json({ flow: responseFor(definition, toInstance(row)) });
    }

    const rows = (await getConvexClient().query(backendApi.guidedFlows.list, {
      tenantId: tenantIdFor(auth.owner, auth.repo),
      actorId: actor,
    })) as GuidedFlowRow[];
    const flows = rows.flatMap((row) => {
      try {
        const definition = definitionForRow(row, customDefinitions);
        return [responseFor(definition, toInstance(row))];
      } catch {
        return [];
      }
    });
    return json({
      flows,
      definitions: [...listGuidedFlowDefinitions(), ...customDefinitions],
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

  const actor = await actorFor(
    req,
    parsed.data.action === "start" ? parsed.data.actorLogin : undefined,
  );
  if (actor instanceof NextResponse) return actor;
  const tenantId = tenantIdFor(auth.owner, auth.repo);
  const client = getConvexClient();

  try {
    if (
      parsed.data.action === "create-definition" ||
      parsed.data.action === "update-definition"
    ) {
      const input = parsed.data;
      const flowId =
        input.action === "update-definition" ? input.flowId : undefined;
      const definition = buildGuidedFlowDefinition(
        input.draft as GuidedFlowDraft,
        flowId,
      );
      const definitions = await customDefinitionsFor(client, tenantId, actor);
      if (flowId) {
        if (
          listGuidedFlowDefinitions().some(
            (candidate) => candidate.id === flowId,
          )
        ) {
          return json(
            { error: "builtin_guided_flow_read_only" },
            { status: 403 },
          );
        }
        if (!definitions.some((candidate) => candidate.id === flowId)) {
          return json({ error: "guided_flow_not_found" }, { status: 404 });
        }
        if (
          definition.id !== flowId &&
          definitions.some((candidate) => candidate.id === definition.id)
        ) {
          return json({ error: "guided_flow_already_exists" }, { status: 409 });
        }
        await client.mutation(backendApi.userState.save, {
          tenantId,
          namespace: "guided-flow-definitions",
          userKey: actor,
          data: definitions.map((candidate) =>
            candidate.id === flowId ? definition : candidate,
          ),
          updatedAt: new Date().toISOString(),
        });
        return json({ definition });
      }
      if (
        listGuidedFlowDefinitions().some(
          (candidate) => candidate.id === definition.id,
        ) ||
        definitions.some((candidate) => candidate.id === definition.id)
      ) {
        return json({ error: "guided_flow_already_exists" }, { status: 409 });
      }
      await client.mutation(backendApi.userState.save, {
        tenantId,
        namespace: "guided-flow-definitions",
        userKey: actor,
        data: [...definitions, definition],
        updatedAt: new Date().toISOString(),
      });
      return json({ definition }, { status: 201 });
    }

    if (parsed.data.action === "delete-definition") {
      const input = parsed.data as z.infer<typeof deleteDefinitionSchema>;
      if (
        listGuidedFlowDefinitions().some(
          (candidate) => candidate.id === input.flowId,
        )
      ) {
        return json(
          { error: "builtin_guided_flow_read_only" },
          { status: 403 },
        );
      }
      const definitions = await customDefinitionsFor(client, tenantId, actor);
      if (!definitions.some((candidate) => candidate.id === input.flowId)) {
        return json({ error: "guided_flow_not_found" }, { status: 404 });
      }
      await client.mutation(backendApi.userState.save, {
        tenantId,
        namespace: "guided-flow-definitions",
        userKey: actor,
        data: definitions.filter((candidate) => candidate.id !== input.flowId),
        updatedAt: new Date().toISOString(),
      });
      return json({ deleted: input.flowId });
    }

    if (parsed.data.action === "start") {
      const start = parsed.data as z.infer<typeof startSchema>;
      const definition =
        getGuidedFlowDefinition(start.flowId) ??
        (await customDefinitionsFor(client, tenantId, actor)).find(
          (candidate) => candidate.id === start.flowId,
        );
      if (!definition)
        return json({ error: "unknown_guided_flow" }, { status: 404 });
      const active = (await client.query(backendApi.guidedFlows.listActive, {
        tenantId,
        actorId: actor,
      })) as GuidedFlowRow[];
      const existing = active.find(
        (row) =>
          row.flowId === definition.id &&
          (row.instanceKey ?? "") === (start.instanceKey ?? ""),
      );
      if (existing) return json(responseFor(definition, toInstance(existing)));

      const instance = createGuidedFlowInstance(
        definition,
        randomUUID(),
        start.instanceKey,
      );
      await client.mutation(backendApi.guidedFlows.upsert, {
        tenantId,
        actorId: actor,
        instanceId: instance.instanceId,
        instanceKey: start.instanceKey,
        flowId: instance.flowId,
        flowVersion: instance.flowVersion,
        currentStepId: instance.currentStepId,
        status: instance.status,
        revision: instance.revision,
        data: instance.data,
        history: [...instance.history],
        updatedAt: new Date().toISOString(),
      });
      return json(responseFor(definition, instance), { status: 201 });
    }

    const instanceRow = (await client.query(backendApi.guidedFlows.get, {
      tenantId,
      actorId: actor,
      instanceId: parsed.data.instanceId,
    })) as GuidedFlowRow | null;
    if (!instanceRow)
      return json({ error: "guided_flow_not_found" }, { status: 404 });
    const definition = definitionForRow(
      instanceRow,
      await customDefinitionsFor(client, tenantId, actor),
    );
    const current = toInstance(instanceRow);
    if (instanceRow.mutationId === parsed.data.mutationId) {
      return json(responseFor(definition, current));
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
    if (
      parsed.data.action === "submit" &&
      definition.id === "create-workflow"
    ) {
      const result = z
        .object({
          workflowName: z.string().trim().min(1).max(160),
          capabilitySlug: z
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
        })
        .safeParse(parsed.data.result);
      if (!result.success && current.currentStepId === "choose-capability") {
        return json(
          { error: "invalid_guided_flow_input", details: result.error.issues },
          { status: 400 },
        );
      }
    }
    const next =
      parsed.data.action === "back"
        ? goBackGuidedFlow(definition, current)
        : parsed.data.action === "cancel" || parsed.data.actionId === "cancel"
          ? cancelGuidedFlow(current)
          : advanceGuidedFlow(definition, current, {
              actionId: parsed.data.actionId ?? "",
              result: parsed.data.result,
            });
    if (JSON.stringify(next.data).length > 20_000) {
      return json({ error: "guided_flow_data_too_large" }, { status: 413 });
    }

    const shouldCompleteEffect =
      parsed.data.action === "submit" && next.status === "completed";
    const workflow = shouldCompleteEffect
      ? await completeGuidedFlowEffect(req, definition, next, actor)
      : undefined;

    await client.mutation(backendApi.guidedFlows.update, {
      tenantId,
      actorId: actor,
      instanceId: current.instanceId,
      expectedRevision: current.revision,
      currentStepId: next.currentStepId,
      status: next.status,
      revision: next.revision,
      data: next.data,
      history: [...next.history],
      updatedAt: new Date().toISOString(),
      mutationId: parsed.data.mutationId,
    });
    return json({
      ...responseFor(definition, next),
      ...(workflow ? { workflow } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GuidedFlow action failed";
    if (message.includes("not active") || message.includes("already at")) {
      return json({ error: "invalid_guided_flow_transition" }, { status: 409 });
    }
    console.error("[GuidedFlows] action failed", error);
    return json({ error: "guided_flow_action_failed" }, { status: 500 });
  }
}
