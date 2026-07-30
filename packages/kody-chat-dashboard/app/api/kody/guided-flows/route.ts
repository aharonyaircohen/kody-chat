import { randomUUID } from "node:crypto";
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
import {
  isNestedGuidedFlowStep,
  type GuidedFlowDefinition,
  type GuidedFlowInstance,
} from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import {
  GuidedFlowCompositionError,
  rootGuidedFlowId,
  validateGuidedFlowComposition,
} from "@kody-ade/kody-chat-dashboard/guided-flows/composition";
import {
  guidedFlowDefinitionForInstance,
  guidedFlowDefinitionForReference,
} from "@kody-ade/kody-chat-dashboard/guided-flows/definitions";
import {
  guidedFlowInstanceFromRow,
  guidedFlowInstanceWriteFields,
  type GuidedFlowStoredInstance,
} from "@kody-ade/kody-chat-dashboard/guided-flows/persistence";
import {
  runGuidedFlowAction,
  startGuidedFlowRuntime,
} from "@kody-ade/kody-chat-dashboard/guided-flows/runtime";
import {
  buildGuidedFlowView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import {
  buildGuidedFlowDefinition,
  type GuidedFlowDraft,
} from "@kody-ade/kody-chat-dashboard/guided-flows/authoring";
import {
  latestAvailableGuidedFlowDefinitions,
  latestStoredGuidedFlowDefinitions,
  parseGuidedFlowDefinitionRows,
  type StoredGuidedFlowDefinition,
} from "@kody-ade/kody-chat-dashboard/guided-flows/stored";
import { resolveDashboardNavigationTarget } from "../../../../src/dashboard/lib/dashboard-navigation";
import { getBuiltinViewRendererDefinition } from "../../../../src/dashboard/lib/view-renderers/builtin";
import { readViewRendererDefinitionFile } from "../../../../src/dashboard/lib/view-renderers/standalone-renderer-store";
import type { ViewRendererDefinition } from "../../../../src/dashboard/lib/view-renderers/definition";

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

const definitionDraftViewStepSchema = z.object({
  type: z.literal("view").optional(),
  title: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(1).max(1_000),
  rendererSlug: z.string().trim().min(1).max(80),
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

class GuidedFlowCompletionError extends Error {
  constructor(
    readonly code:
      | "guided_flow_workflow_exists"
      | "guided_flow_invalid_workflow"
      | "guided_flow_auth_failed"
      | "guided_flow_rate_limited"
      | "guided_flow_completion_failed",
    readonly status: number,
  ) {
    super(code);
  }
}

function completionErrorFor(
  errorCode: string | undefined,
  status: number,
): GuidedFlowCompletionError {
  if (errorCode === "workflow_exists") {
    return new GuidedFlowCompletionError("guided_flow_workflow_exists", 409);
  }
  if (errorCode === "invalid_workflow" || errorCode === "invalid_body") {
    return new GuidedFlowCompletionError("guided_flow_invalid_workflow", 400);
  }
  if (errorCode === "github_token_expired") {
    return new GuidedFlowCompletionError("guided_flow_auth_failed", 401);
  }
  if (errorCode === "rate_limited") {
    return new GuidedFlowCompletionError("guided_flow_rate_limited", 429);
  }
  return new GuidedFlowCompletionError(
    "guided_flow_completion_failed",
    status >= 400 && status < 500 ? status : 502,
  );
}

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

async function customDefinitionsFor(
  client: ReturnType<typeof getConvexClient>,
  tenantId: string,
): Promise<StoredGuidedFlowDefinition[]> {
  const rows = await client.query(backendApi.guidedFlows.listDefinitions, {
    tenantId,
  });
  return parseGuidedFlowDefinitionRows(rows);
}

const latestStoredDefinitions = latestStoredGuidedFlowDefinitions;
const latestAvailableCustomDefinitions = latestAvailableGuidedFlowDefinitions;

function latestStoredDefinition(
  definitions: readonly StoredGuidedFlowDefinition[],
  flowId: string,
): StoredGuidedFlowDefinition | undefined {
  return latestStoredDefinitions(definitions).find(
    (definition) => definition.id === flowId,
  );
}

/**
 * Custom (non-builtin) renderers referenced by a definition's steps, loaded
 * from the tenant's view-renderer store so flows can display them.
 */
async function customRenderersFor(
  owner: string,
  repo: string,
  definitions: readonly GuidedFlowDefinition[],
): Promise<Record<string, ViewRendererDefinition>> {
  const slugs = [
    ...new Set(
      definitions
        .flatMap((definition) => definition.steps)
        .flatMap((step) =>
          isNestedGuidedFlowStep(step) ? [] : [step.rendererSlug],
        )
        .filter((slug) => !getBuiltinViewRendererDefinition(slug)),
    ),
  ];
  const out: Record<string, ViewRendererDefinition> = {};
  for (const slug of slugs) {
    const file = await readViewRendererDefinitionFile({ owner, repo, slug });
    if (file) out[slug] = file.definition;
  }
  return out;
}

function navigationForCompletion(definition: GuidedFlowDefinition) {
  if (!definition.completionRouteId) return undefined;
  const resolved = resolveDashboardNavigationTarget({
    routeId: definition.completionRouteId,
    reason: `Open ${definition.title} results`,
  });
  if ("error" in resolved) return undefined;
  return {
    action: "dashboard_navigate" as const,
    ...resolved,
  };
}

function hasValidCompletionRoute(definition: GuidedFlowDefinition): boolean {
  if (!definition.completionRouteId) return true;
  return !(
    "error" in
    resolveDashboardNavigationTarget({
      routeId: definition.completionRouteId,
      reason: `Open ${definition.title} results`,
    })
  );
}

function responseFor(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  customRenderers?: Readonly<Record<string, ViewRendererDefinition>>,
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
      ? { view: buildGuidedFlowView(definition, instance, customRenderers) }
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
    throw new GuidedFlowCompletionError("guided_flow_invalid_workflow", 400);
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
    throw completionErrorFor(payload.error, response.status);
  }
  return payload.workflow;
}

/**
 * Best-effort append-only ledger of finished flows — one row per completed
 * instance in guidedFlowCompletions, idempotent by instanceId. A write
 * failure must never undo an already-persisted completion, so errors are
 * logged and swallowed.
 */
async function recordGuidedFlowCompletion(
  client: ReturnType<typeof getConvexClient>,
  tenantId: string,
  actor: string,
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): Promise<void> {
  try {
    await client.mutation(backendApi.guidedFlows.recordCompletion, {
      tenantId,
      actorId: actor,
      instanceId: instance.instanceId,
      flowId: definition.id,
      flowVersion: definition.version,
      completedAt: new Date().toISOString(),
      data: instance.data,
    });
  } catch (error) {
    console.error("[GuidedFlows] completion record failed", error);
  }
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
    );
    if (new URL(req.url).searchParams.get("view") === "templates") {
      return json({
        definitions: [
          ...listGuidedFlowDefinitions(),
          ...latestAvailableCustomDefinitions(customDefinitions),
        ],
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
        flow: responseFor(
          definition,
          guidedFlowInstanceFromRow(row),
          await customRenderersFor(auth.owner, auth.repo, [definition]),
        ),
      });
    }

    const rows = (await getConvexClient().query(backendApi.guidedFlows.list, {
      tenantId: tenantIdFor(auth.owner, auth.repo),
      actorId: actor,
    })) as GuidedFlowRow[];
    const listRenderers = await customRenderersFor(
      auth.owner,
      auth.repo,
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
          responseFor(
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
      definitions: [
        ...listGuidedFlowDefinitions(),
        ...latestAvailableCustomDefinitions(customDefinitions),
      ],
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
      const flowId =
        input.action === "update-definition" ? input.flowId : undefined;
      const customDefinitions = await customDefinitionsFor(client, tenantId);
      const nextVersion =
        (flowId
          ? latestStoredDefinition(customDefinitions, flowId)?.version
          : 0) ?? 0;
      const draft = input.draft as GuidedFlowDraft;
      const candidateDefinition = buildGuidedFlowDefinition(
        draft,
        flowId,
        nextVersion + 1,
      );
      if (!hasValidCompletionRoute(candidateDefinition)) {
        return json({ error: "invalid_completion_route" }, { status: 400 });
      }
      try {
        validateGuidedFlowComposition(candidateDefinition, [
          ...listGuidedFlowDefinitions(),
          ...customDefinitions,
        ]);
      } catch (error) {
        if (error instanceof GuidedFlowCompositionError) {
          return json({ error: error.code }, { status: 400 });
        }
        throw error;
      }
      if (
        flowId &&
        listGuidedFlowDefinitions().some((candidate) => candidate.id === flowId)
      ) {
        return json(
          { error: "builtin_guided_flow_read_only" },
          { status: 403 },
        );
      }
      if (
        listGuidedFlowDefinitions().some(
          (candidate) => candidate.id === candidateDefinition.id,
        )
      ) {
        return json({ error: "guided_flow_already_exists" }, { status: 409 });
      }
      // Version bump and existence checks run atomically in the backend.
      const version = (await client.mutation(
        backendApi.guidedFlows.saveDefinition,
        {
          tenantId,
          flowId: candidateDefinition.id,
          mode:
            flowId && candidateDefinition.id === flowId ? "update" : "create",
          definition: candidateDefinition,
          updatedAt: new Date().toISOString(),
        },
      )) as number;
      const definition = { ...candidateDefinition, version };
      return json({ definition }, { status: flowId ? 200 : 201 });
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
      const definitions = await customDefinitionsFor(client, tenantId);
      const latestDefinition = latestStoredDefinition(
        definitions,
        input.flowId,
      );
      if (!latestDefinition || latestDefinition.archived) {
        return json({ error: "guided_flow_not_found" }, { status: 404 });
      }
      await client.mutation(backendApi.guidedFlows.saveDefinition, {
        tenantId,
        flowId: input.flowId,
        mode: "archive",
        definition: latestDefinition,
        updatedAt: new Date().toISOString(),
      });
      return json({ deleted: input.flowId });
    }

    if (parsed.data.action === "start") {
      const start = parsed.data as z.infer<typeof startSchema>;
      const customDefinitions = await customDefinitionsFor(client, tenantId);
      const definition =
        getGuidedFlowDefinition(start.flowId) ??
        latestAvailableCustomDefinitions(customDefinitions).find(
          (candidate) => candidate.id === start.flowId,
        );
      if (!definition)
        return json({ error: "unknown_guided_flow" }, { status: 404 });
      const active = (await client.query(backendApi.guidedFlows.listActive, {
        tenantId,
        actorId: actor,
      })) as GuidedFlowRow[];
      const existing = active.find((row) => {
        const instance = guidedFlowInstanceFromRow(row);
        return (
          rootGuidedFlowId(instance) === definition.id &&
          (row.instanceKey ?? "") === (start.instanceKey ?? "")
        );
      });
      if (existing) {
        const existingDefinition = definitionForRow(
          existing,
          customDefinitions,
        );
        return json(
          responseFor(
            existingDefinition,
            guidedFlowInstanceFromRow(existing),
            await customRenderersFor(auth.owner, auth.repo, [
              existingDefinition,
            ]),
          ),
        );
      }

      const entered = startGuidedFlowRuntime({
        definition,
        instanceId: randomUUID(),
        instanceKey: start.instanceKey,
        resolveDefinition: (flowId, flowVersion) =>
          guidedFlowDefinitionForReference(
            flowId,
            flowVersion,
            customDefinitions,
          ),
      });
      await client.mutation(backendApi.guidedFlows.upsert, {
        tenantId,
        actorId: actor,
        ...guidedFlowInstanceWriteFields(entered.instance),
        updatedAt: new Date().toISOString(),
      });
      return json(
        responseFor(
          entered.definition,
          entered.instance,
          await customRenderersFor(auth.owner, auth.repo, [entered.definition]),
        ),
        { status: 201 },
      );
    }

    const instanceRow = (await client.query(backendApi.guidedFlows.get, {
      tenantId,
      actorId: actor,
      instanceId: parsed.data.instanceId,
    })) as GuidedFlowRow | null;
    if (!instanceRow)
      return json({ error: "guided_flow_not_found" }, { status: 404 });
    const customDefinitions = await customDefinitionsFor(client, tenantId);
    let definition = definitionForRow(instanceRow, customDefinitions);
    const current = guidedFlowInstanceFromRow(instanceRow);
    if (instanceRow.mutationId === parsed.data.mutationId) {
      return json(
        responseFor(
          definition,
          current,
          await customRenderersFor(auth.owner, auth.repo, [definition]),
        ),
      );
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
    let workflow: unknown;
    for (const completed of runtime.completed) {
      workflow =
        (await completeGuidedFlowEffect(
          req,
          completed.definition,
          completed.instance,
          actor,
        )) ?? workflow;
    }

    if (
      JSON.stringify({
        data: next.data,
        output: next.output,
        stack: next.stack,
      }).length > 20_000
    ) {
      return json({ error: "guided_flow_data_too_large" }, { status: 413 });
    }

    await client.mutation(backendApi.guidedFlows.update, {
      tenantId,
      actorId: actor,
      expectedRevision: current.revision,
      ...guidedFlowInstanceWriteFields(next),
      updatedAt: new Date().toISOString(),
      mutationId: parsed.data.mutationId,
    });
    if (next.status === "completed") {
      await recordGuidedFlowCompletion(
        client,
        tenantId,
        actor,
        definition,
        next,
      );
    }
    return json({
      ...responseFor(
        definition,
        next,
        await customRenderersFor(auth.owner, auth.repo, [definition]),
      ),
      ...(workflow ? { workflow } : {}),
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
