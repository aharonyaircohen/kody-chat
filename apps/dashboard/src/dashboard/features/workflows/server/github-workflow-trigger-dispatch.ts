import "server-only";
import { createHash } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import type { SystemEventEnvelope } from "@kody-ade/base/events/types";
import { logger } from "@kody-ade/base/logger";
import { getTriggers } from "@kody-ade/base/triggers/config";
import {
  resolveActionData,
  triggerMatches,
} from "@kody-ade/base/triggers/engine";
import { consumeStoredAgencyApproval } from "@kody-ade/agency/agency-approvals";
import { createCompanyWorkflowLoader } from "./company-workflow-loader";
import { createGitHubActionsEngineGateway } from "./github-actions-engine-gateway";
import { startWorkflow } from "./start-workflow";
import {
  validateWorkflowInput,
  validateWorkflowDefinition,
} from "@dashboard/lib/workflow-definitions";
import { workflowRequiresApproval } from "./workflow-execution-authorization";
import { workflowRunAction } from "@kody-ade/agency/workflow-run-approval";

const MAX_INPUT_BYTES = 64_000;

function requestIdFor(sourceEventId: string, triggerId: string): string {
  const digest = createHash("sha256")
    .update(`${sourceEventId}:${triggerId}`)
    .digest("hex")
    .slice(0, 40);
  return `github-${digest}`;
}

function sourceEventIdFor(event: SystemEventEnvelope): string {
  const payload = event.payload as { runId?: unknown };
  return typeof payload.runId === "number"
    ? `${event.name}:${payload.runId}`
    : event.id;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateDelivery(
  operation: "markDispatched" | "markFailed",
  input: {
    owner: string;
    repo: string;
    deliveryId: string;
    sourceEventId: string;
    triggerId: string;
    error?: string;
  },
): Promise<void> {
  const client = createBackendClient();
  if (operation === "markDispatched") {
    await client.mutation(api.workflowEventDeliveries.markDispatched, {
      tenantId: `${input.owner}/${input.repo}`,
      deliveryId: input.deliveryId,
      sourceEventId: input.sourceEventId,
      triggerId: input.triggerId,
      now: new Date().toISOString(),
    });
    return;
  }
  await client.mutation(api.workflowEventDeliveries.markFailed, {
    tenantId: `${input.owner}/${input.repo}`,
    deliveryId: input.deliveryId,
    sourceEventId: input.sourceEventId,
    triggerId: input.triggerId,
    error: input.error ?? "workflow trigger failed",
    now: new Date().toISOString(),
  });
}

/**
 * Start configured Workflows for one normalized GitHub event. Delivery claims
 * are durable and keyed by source event + trigger, so webhook redeliveries do
 * not start the same configured Workflow twice.
 */
export async function dispatchGitHubWorkflowTriggers(input: {
  event: SystemEventEnvelope;
  deliveryId: string;
  octokit: Octokit;
}): Promise<void> {
  const brand = input.event.brand;
  if (!brand) return;

  const sourceEventId = sourceEventIdFor(input.event);

  const triggers = await getTriggers(input.octokit, brand.owner, brand.repo, {
    cache: false,
  });
  const workflowPath = input.event.payload.workflowPath;
  if (workflowPath === ".github/workflows/kody.yml") {
    logger.info(
      { owner: brand.owner, repo: brand.repo, delivery: input.deliveryId },
      "github workflow trigger skipped for Kody Engine workflow to prevent recursion",
    );
    return;
  }
  for (const trigger of triggers) {
    if (trigger.action.type !== "start-workflow") continue;
    if (!triggerMatches(trigger, input.event)) continue;
    const action = trigger.action;
    const requestId = requestIdFor(sourceEventId, trigger.id);
    const workflowInput = resolveActionData(trigger, input.event);

    let claim: { claimed: boolean; status: string };
    try {
      claim = await createBackendClient().mutation(
        api.workflowEventDeliveries.reserve,
        {
          tenantId: `${brand.owner}/${brand.repo}`,
          deliveryId: input.deliveryId,
          sourceEventId,
          triggerId: trigger.id,
          workflowId: action.workflowId,
          eventName: input.event.name,
          requestId,
          sourceUrl:
            typeof input.event.payload.htmlUrl === "string"
              ? input.event.payload.htmlUrl
              : undefined,
          input: workflowInput,
          now: new Date().toISOString(),
        },
      );
    } catch (error) {
      logger.warn(
        { trigger: trigger.id, error: errorMessage(error) },
        "github workflow trigger claim failed; continuing with remaining triggers",
      );
      continue;
    }
    if (!claim.claimed) continue;

    if (JSON.stringify(workflowInput).length > MAX_INPUT_BYTES) {
      try {
        await updateDelivery("markFailed", {
          owner: brand.owner,
          repo: brand.repo,
          deliveryId: input.deliveryId,
          sourceEventId,
          triggerId: trigger.id,
          error: "workflow input exceeds 64KB",
        });
      } catch (error) {
        logger.warn(
          { trigger: trigger.id, error: errorMessage(error) },
          "oversized workflow input failure could not be recorded",
        );
      }
      logger.warn(
        { trigger: trigger.id, workflow: action.workflowId },
        "github workflow trigger skipped: input too large",
      );
      continue;
    }

    const actor = `github-webhook:${brand.owner}/${brand.repo}`;
    try {
      const result = await startWorkflow(
        {
          workflowId: action.workflowId,
          source: "github",
          actor,
          requestId,
          input: workflowInput,
        },
        {
          createRequestId: () => requestId,
          now: () => new Date().toISOString(),
          loadWorkflow: createCompanyWorkflowLoader({
            octokit: input.octokit,
            owner: brand.owner,
            repo: brand.repo,
          }),
          validateDefinition: validateWorkflowDefinition,
          validateInput: (schema, value) =>
            validateWorkflowInput(value, schema),
          requiresApproval: workflowRequiresApproval,
          actionFor: workflowRunAction,
          consumeApproval: (approval) =>
            consumeStoredAgencyApproval({
              owner: brand.owner,
              repo: brand.repo,
              approvalId: approval.approvalId,
              scopeKind: "workflow",
              scopeId: approval.workflowId,
              action: approval.action,
              approvedBy: approval.actor,
              dispatchKey: approval.dispatchKey,
              consumedAt: approval.consumedAt,
            }),
          dispatch: createGitHubActionsEngineGateway({
            octokit: input.octokit,
            owner: brand.owner,
            repo: brand.repo,
          }),
        },
      );

      if (result.kind !== "accepted") {
        const reason =
          result.kind === "invalid"
            ? result.issues.map((issue) => issue.message).join("; ")
            : result.kind;
        await updateDelivery("markFailed", {
          owner: brand.owner,
          repo: brand.repo,
          deliveryId: input.deliveryId,
          sourceEventId,
          triggerId: trigger.id,
          error: reason,
        });
        logger.warn(
          {
            trigger: trigger.id,
            workflow: action.workflowId,
            result: result.kind,
          },
          "github workflow trigger did not dispatch",
        );
        continue;
      }
      await updateDelivery("markDispatched", {
        owner: brand.owner,
        repo: brand.repo,
        deliveryId: input.deliveryId,
        sourceEventId,
        triggerId: trigger.id,
      });
    } catch (error) {
      try {
        await updateDelivery("markFailed", {
          owner: brand.owner,
          repo: brand.repo,
          deliveryId: input.deliveryId,
          sourceEventId,
          triggerId: trigger.id,
          error: errorMessage(error),
        });
      } catch (markFailedError) {
        logger.warn(
          { trigger: trigger.id, error: errorMessage(markFailedError) },
          "github workflow trigger failure could not be recorded",
        );
      }
      logger.warn(
        {
          trigger: trigger.id,
          workflow: action.workflowId,
          error: errorMessage(error),
        },
        "github workflow trigger failed; continuing with remaining triggers",
      );
    }
  }
}
