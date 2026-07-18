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
} from "@kody-ade/kody-chat/guided-flows/registry";
import { resolveDashboardNavigationTarget } from "@dashboard/lib/dashboard-navigation";
import {
  PROVIDER_CATALOG,
  credentialNames,
  isSupportedProviderId,
} from "@dashboard/lib/client-auth/catalog";

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

function definitionForRow(row: GuidedFlowRow): GuidedFlowDefinition {
  const definition = getGuidedFlowDefinition(row.flowId);
  if (!definition || definition.version !== row.flowVersion) {
    throw new Error("GuidedFlow definition is no longer available");
  }
  return definition;
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
  rawResult?: Readonly<Record<string, unknown>>,
) {
  if (definition.id === "client-signin") {
    return completeClientSigninEffect(req, instance, rawResult ?? {}, actor);
  }
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

async function completeClientSigninEffect(
  req: NextRequest,
  instance: GuidedFlowInstance,
  rawResult: Readonly<Record<string, unknown>>,
  actor: string,
) {
  const provider = instance.instanceKey?.trim() ?? "";
  if (!isSupportedProviderId(provider)) {
    throw new Error("GuidedFlow has incomplete sign-in credentials");
  }
  const providerSpec = PROVIDER_CATALOG[provider];
  const providerCredentials = credentialNames(provider);

  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(new URL(path, req.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, actorLogin: actor }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message ?? payload.error ?? `${path} failed`);
    }
  };

  if (Object.keys(rawResult).length > 0) {
    const input = z
      .object({
        clientId: z.string().trim().min(1).max(2_000),
        clientSecret: z.string().min(1).max(4_000),
        issuer: z.string().trim().max(2_000).optional(),
      })
      .safeParse(rawResult);
    if (!input.success || (providerSpec.extra && !input.data.issuer)) {
      throw new Error("GuidedFlow has incomplete sign-in credentials");
    }
    await post("/api/kody/variables", {
      name: providerCredentials.id,
      value: input.data.clientId,
    });
    await post("/api/kody/secrets", {
      name: providerCredentials.secret,
      value: input.data.clientSecret,
    });
    if (input.data.issuer) {
      await post("/api/kody/variables", {
        name: providerSpec.extra?.issuer ?? `${provider.toUpperCase()}_ISSUER`,
        value: input.data.issuer,
      });
    }
  }
  if (instance.data.actionId === "approve") {
    await post("/api/kody/wizards/check", {
      checkId: "client-signin-credentials",
      params: { provider },
    });
  }
  return { provider };
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = requireRepo(req);
  if (auth instanceof NextResponse) return auth;
  const actor = await actorFor(req);
  if (actor instanceof NextResponse) return actor;

  try {
    const rows = (await getConvexClient().query(
      backendApi.guidedFlows.listActive,
      {
        tenantId: tenantIdFor(auth.owner, auth.repo),
        actorId: actor,
      },
    )) as GuidedFlowRow[];
    const flows = rows.flatMap((row) => {
      try {
        const definition = definitionForRow(row);
        return [responseFor(definition, toInstance(row))];
      } catch {
        return [];
      }
    });
    return json({ flows });
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
    if (parsed.data.action === "start") {
      const start = parsed.data as z.infer<typeof startSchema>;
      const definition = getGuidedFlowDefinition(start.flowId);
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
    const definition = definitionForRow(instanceRow);
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
    if (parsed.data.action === "submit" && definition.id === "client-signin") {
      const result = z
        .object({
          clientId: z.string().trim().min(1).max(2_000),
          clientSecret: z.string().min(1).max(4_000),
          issuer: z.string().trim().max(2_000).optional(),
        })
        .safeParse(parsed.data.result);
      if (!result.success && current.currentStepId === "collect-credentials") {
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

    const workflow =
      (definition.id === "client-signin" &&
        current.currentStepId === "collect-credentials") ||
      next.status === "completed"
        ? await completeGuidedFlowEffect(
            req,
            definition,
            next,
            actor,
            parsed.data.result,
          )
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
