/**
 * Preview or apply the repository's AI Agency V2 migration.
 * POST is fail-closed: unresolved ownership prevents every write; a complete
 * legacy snapshot is persisted before immutable V2 definitions are created.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Octokit } from "@octokit/rest";
import {
  companyStoreAssetPath,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import {
  agencyDefinitionRecordId,
  createStoredAgencyDefinition,
  putStoredAgencyState,
  type AgencyDefinitionKind,
} from "@kody-ade/agency/backend/agency-model-store";
import { listCapabilityFiles } from "@kody-ade/agency/capabilities";
import { planAgencyV2Migration } from "@kody-ade/agency/migration/agency-v2";
import { verifyRepoWriteAccess } from "@kody-ade/agency/routes/repo-write-access";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { listCompanyIntentRecords } from "@dashboard/lib/company-intents-store";
import { listManagedGoalFiles } from "@dashboard/lib/managed-goals-files";
import {
  collapseManagedGoalRecordsForList,
  managedGoalModel,
} from "@dashboard/lib/managed-goals";
import { listOperationFiles } from "@dashboard/lib/operation-files";
import {
  listCompanyStoreWorkflowDefinitionFiles,
  listWorkflowDefinitionFiles,
  readCompanyStoreWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

async function buildSnapshot(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const { auth } = access;
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const octokit = (await import("@kody-ade/base/auth")).getUserOctokit;
    const client = await octokit(req);
    if (!client) {
      return NextResponse.json({ error: "request_auth_required" }, { status: 401 });
    }
    const [
      intentRecords,
      operationRecords,
      managedRecords,
      capabilities,
      localWorkflows,
      storeWorkflows,
    ] =
      await Promise.all([
        listCompanyIntentRecords(auth.owner, auth.repo),
        listOperationFiles(client, auth.owner, auth.repo),
        listManagedGoalFiles(client, auth.owner, auth.repo),
        listCapabilityFiles(),
        listWorkflowDefinitionFiles(auth.owner, auth.repo),
        listCompanyStoreWorkflowDefinitionFiles(client),
      ]);
    const referencedWorkflowIds = new Set(
      managedRecords.flatMap((record) => {
        const target = record.state.loopTarget;
        return [
          ...(record.state.workflowRef ? [record.state.workflowRef.id] : []),
          ...(target?.type === "workflow" ? [target.id] : []),
        ];
      }),
    );
    const directlyReferencedStoreWorkflows = (
      await Promise.all(
        [...referencedWorkflowIds].map((id) =>
          readCompanyStoreWorkflowDefinitionFile(id, client),
        ),
      )
    ).filter((record) => record !== null);
    const managedWork = collapseManagedGoalRecordsForList(managedRecords);
    const snapshot = {
      tenantId: tenantIdFor(auth.owner, auth.repo),
      capturedAt: new Date().toISOString(),
      intents: intentRecords.map((record) => record.intent),
      operations: operationRecords.map((record) => record.operation),
      managedWork: managedWork.map((record) => ({
        id: record.id,
        model: managedGoalModel(record) === "agentLoop" ? ("loop" as const) : ("goal" as const),
        destination: record.state.destination,
        route: record.state.route.map((step) => ({
          stage: step.stage,
          capability: step.capability,
          ...(step.args ? { args: step.args } : {}),
        })),
        capabilities: record.state.capabilities,
        ...(record.state.schedule ? { schedule: record.state.schedule } : {}),
        ...(record.state.workflowRef ? { workflowRef: { id: record.state.workflowRef.id } } : {}),
        ...(record.state.loopTarget ? { loopTarget: record.state.loopTarget } : {}),
        state: record.state.state,
        facts: record.state.facts,
        blockers: record.state.blockers,
        ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
        ...(record.state.scheduleState
          ? { scheduleState: record.state.scheduleState }
          : {}),
      })),
      capabilities,
      workflows: [
        ...localWorkflows,
        ...storeWorkflows,
        ...directlyReferencedStoreWorkflows,
      ]
        .filter(
          (record, index, records) =>
            records.findIndex((candidate) => candidate.id === record.id) === index,
        )
        .map((record) => ({
          id: record.id,
          capabilities: record.workflow.capabilities,
          ...(record.workflow.steps ? { steps: record.workflow.steps } : {}),
        })),
    };
    return { access, snapshot, client };
  } finally {
    clearGitHubContext();
  }
}

async function readStoreDefinitions(
  client: Octokit,
  kind: "capabilities" | "implementations",
  requiredIds: string[],
) {
  return await Promise.all(
    requiredIds.map(async (id) => {
      const root = await companyStoreAssetPath(client, kind, id);
      const raw = await readCompanyStoreText(client, `${root}/definition.json`);
      return raw ? JSON.parse(raw) : null;
    }),
  );
}

async function preview(req: NextRequest) {
  const built = await buildSnapshot(req);
  if (built instanceof NextResponse) return built;
  const plan = planAgencyV2Migration(built.snapshot);
  const [capabilities, implementations] = await Promise.all([
    readStoreDefinitions(
      built.client,
      "capabilities",
      plan.requiredCapabilityIds,
    ),
    readStoreDefinitions(
      built.client,
      "implementations",
      plan.requiredCapabilityIds,
    ),
  ]);
  const capabilityDefinitions = capabilities.filter(
    (definition): definition is { id: string } => definition !== null,
  );
  const implementationDefinitions = implementations.filter(
    (definition): definition is { id: string } => definition !== null,
  );
  const implementationIds = new Set(
    implementationDefinitions.map((definition) => definition.id),
  );
  const missingImplementations = plan.requiredCapabilityIds.filter(
    (id) => !implementationIds.has(id),
  );
  const capabilityIds = new Set(
    capabilityDefinitions.map((definition) => definition.id),
  );
  const missingCapabilities = plan.requiredCapabilityIds.filter(
    (id) => !capabilityIds.has(id),
  );
  return {
    ...built,
    plan,
    capabilityDefinitions,
    implementationDefinitions,
    missingCapabilities,
    missingImplementations,
  };
}

export async function GET(req: NextRequest) {
  try {
    const result = await preview(req);
    if (result instanceof NextResponse) return result;
    return NextResponse.json({
      plan: result.plan,
      missingCapabilities: result.missingCapabilities,
      missingImplementations: result.missingImplementations,
      canApply:
        result.plan.issues.length === 0 &&
        result.missingCapabilities.length === 0 &&
        result.missingImplementations.length === 0,
    });
  } catch {
    return NextResponse.json({ error: "migration_preview_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await preview(req);
    if (result instanceof NextResponse) return result;
    const issues = [
      ...result.plan.issues,
      ...result.missingCapabilities.map((id) => `Missing Capability "${id}"`),
      ...result.missingImplementations.map(
        (id) => `Missing Implementation for Capability "${id}"`,
      ),
    ];
    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: "migration_blocked",
          message: `Migration blocked: ${issues.join("; ")}`,
          issues,
        },
        { status: 409 },
      );
    }
    const migrationId = `agency-v2-${Date.now()}`;
    await getConvexClient().mutation(backendApi.repoDocs.save, {
      tenantId: result.snapshot.tenantId,
      kind: `agency-v2-backup:${migrationId}`,
      doc: result.snapshot,
      updatedAt: result.snapshot.capturedAt,
    });
    const groups: Array<[AgencyDefinitionKind, Array<{ id: string }>]> = [
      ["intent", result.plan.definitions.intents],
      ["operation", result.plan.definitions.operations],
      ["workflow", result.plan.definitions.workflows],
      ["capability", result.capabilityDefinitions],
      ["implementation", result.implementationDefinitions],
      ["goal", result.plan.definitions.goals],
      ["loop", result.plan.definitions.loops],
    ];
    let created = 0;
    let reused = 0;
    for (const [kind, definitions] of groups) {
      for (const definition of definitions) {
        try {
          await createStoredAgencyDefinition({
            owner: result.access.auth.owner,
            repo: result.access.auth.repo,
            recordId: agencyDefinitionRecordId(kind, definition),
            kind,
            data: definition,
            createdAt: result.snapshot.capturedAt,
          });
          created += 1;
        } catch (error) {
          if (error instanceof Error && /immutable|already exists/i.test(error.message)) {
            reused += 1;
          } else {
            throw error;
          }
        }
      }
    }
    for (const state of result.plan.states.goals) {
      await putStoredAgencyState({
        owner: result.access.auth.owner,
        repo: result.access.auth.repo,
        kind: "goal",
        data: state,
        updatedAt: state.updatedAt,
      });
    }
    for (const state of result.plan.states.loops) {
      await putStoredAgencyState({
        owner: result.access.auth.owner,
        repo: result.access.auth.repo,
        kind: "loop",
        data: state,
        updatedAt: state.updatedAt,
      });
    }
    return NextResponse.json({ ok: true, migrationId, created, reused }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "migration_apply_failed", message: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 },
    );
  }
}
