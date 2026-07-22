import { NextResponse } from "next/server";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  bearerToken,
  verifyGitHubWorkflowIdentity,
} from "@dashboard/lib/backend/github-actions-identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z.object({
  kind: z.enum(["query", "mutation"]),
  operation: z.string().min(1).max(100),
  args: z.record(z.string(), z.unknown()).default({}),
});

const operations = {
  "taskState.get": { kind: "query", fn: backendApi.taskState.get },
  "taskState.save": { kind: "mutation", fn: backendApi.taskState.save },
  "repoDocs.get": { kind: "query", fn: backendApi.repoDocs.get },
  "repoDocs.listByPrefix": {
    kind: "query",
    fn: backendApi.repoDocs.listByPrefix,
  },
  "repoDocs.save": { kind: "mutation", fn: backendApi.repoDocs.save },
  "goals.get": { kind: "query", fn: backendApi.goals.get },
  "goals.list": { kind: "query", fn: backendApi.goals.list },
  "goals.save": { kind: "mutation", fn: backendApi.goals.save },
  "dailyLogs.append": { kind: "mutation", fn: backendApi.dailyLogs.append },
  "chatEvents.append": { kind: "mutation", fn: backendApi.chatEvents.append },
  "agencyRuns.save": { kind: "mutation", fn: backendApi.agencyRuns.save },
  "agencyModel.listDefinitions": {
    kind: "query",
    fn: backendApi.agencyModel.listDefinitions,
  },
  "agencyModel.getState": {
    kind: "query",
    fn: backendApi.agencyModel.getState,
  },
  "agencyModel.putState": {
    kind: "mutation",
    fn: backendApi.agencyModel.putState,
  },
  "agencyModel.appendOutput": {
    kind: "mutation",
    fn: backendApi.agencyModel.appendOutput,
  },
  "agencyModel.listOutputs": {
    kind: "query",
    fn: backendApi.agencyModel.listOutputs,
  },
  "agencyModel.reserveDispatch": {
    kind: "mutation",
    fn: backendApi.agencyModel.reserveDispatch,
  },
  "agencyModel.recordSkippedDispatch": {
    kind: "mutation",
    fn: backendApi.agencyModel.recordSkippedDispatch,
  },
  "agencyModel.finishDispatch": {
    kind: "mutation",
    fn: backendApi.agencyModel.finishDispatch,
  },
  "runEvents.append": { kind: "mutation", fn: backendApi.runEvents.append },
  "manifests.get": { kind: "query", fn: backendApi.manifests.get },
  "reports.save": { kind: "mutation", fn: backendApi.reports.save },
  "intents.list": { kind: "query", fn: backendApi.intents.list },
  "intents.get": { kind: "query", fn: backendApi.intents.get },
  "intents.save": { kind: "mutation", fn: backendApi.intents.save },
  "intents.appendDecision": {
    kind: "mutation",
    fn: backendApi.intents.appendDecision,
  },
  "definitions.listCurrent": {
    kind: "query",
    fn: backendApi.definitions.listCurrent,
  },
  "workflows.list": { kind: "query", fn: backendApi.workflows.list },
  "workflowRuns.get": { kind: "query", fn: backendApi.workflowRuns.get },
  "workflowRuns.save": { kind: "mutation", fn: backendApi.workflowRuns.save },
} as const;

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "missing_workflow_identity" },
      { status: 401 },
    );
  }

  let identity;
  try {
    identity = await verifyGitHubWorkflowIdentity(token);
  } catch {
    return NextResponse.json(
      { error: "invalid_workflow_identity" },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const selected = operations[parsed.data.operation as keyof typeof operations];
  if (!selected || selected.kind !== parsed.data.kind) {
    return NextResponse.json(
      { error: "unsupported_operation" },
      { status: 400 },
    );
  }

  const {
    tenantId: _ignoredTenant,
    serviceKey: _ignoredKey,
    ...callerArgs
  } = parsed.data.args;
  const args = { ...callerArgs, tenantId: identity.repository };

  try {
    const client = createBackendClient();
    const result =
      selected.kind === "query"
        ? await client.query(selected.fn as never, args as never)
        : await client.mutation(selected.fn as never, args as never);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Kody engine backend request failed", {
      operation: parsed.data.operation,
      repository: identity.repository,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "backend_request_failed" },
      { status: 500 },
    );
  }
}
