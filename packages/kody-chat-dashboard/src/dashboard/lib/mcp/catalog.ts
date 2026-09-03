import { z } from "zod";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  KODY_MCP_CONTRACT_VERSION,
  toJsonSchema,
  type JsonSchema,
  type McpPrincipal,
  type PermissionClass,
} from "./contracts";
import { NotificationCreateRuleInputSchema } from "../notifications";

type ApprovalPolicy = "none" | "required";

export type KodyAction = {
  id: string;
  title: string;
  summary: string;
  category: string;
  permission: PermissionClass;
  sideEffects: boolean;
  approval: ApprovalPolicy;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  examples: Array<{ input: Record<string, unknown>; description: string }>;
};

type InternalAction = KodyAction & {
  input: z.ZodType;
  execute: (
    input: Record<string, unknown>,
    principal: McpPrincipal,
    context: ActionExecutionContext,
  ) => Promise<unknown> | unknown;
};

export interface KodyMcpActionServices {
  listWork(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  getWork(recordId: string, principal: McpPrincipal): Promise<unknown>;
  createWork(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  appendWork(
    type:
      | "update"
      | "checkpoint"
      | "evidence"
      | "decision"
      | "handoff"
      | "artifact",
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  listPolicies(principal: McpPrincipal): Promise<unknown>;
  getPolicy(slug: string, principal: McpPrincipal): Promise<unknown>;
  getInstructions(principal: McpPrincipal): Promise<unknown>;
  listCapabilities(principal: McpPrincipal): Promise<unknown>;
  getCapability(slug: string, principal: McpPrincipal): Promise<unknown>;
  listWorkflows(principal: McpPrincipal): Promise<unknown>;
  getWorkflow(id: string, principal: McpPrincipal): Promise<unknown>;
  getQualityGates(principal: McpPrincipal): Promise<unknown>;
  listApprovals(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  getApproval(requestId: string, principal: McpPrincipal): Promise<unknown>;
  requestWorkflowRun(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestWorkflowResume(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestCapabilityRun(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  listSchedules(principal: McpPrincipal): Promise<unknown>;
  getSchedule(id: string, principal: McpPrincipal): Promise<unknown>;
  listTriggers(principal: McpPrincipal): Promise<unknown>;
  getTrigger(id: string, principal: McpPrincipal): Promise<unknown>;
  getWebhookStatus(principal: McpPrincipal): Promise<unknown>;
  listNotificationRules(principal: McpPrincipal): Promise<unknown>;
  listRuns(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  getRun(runId: string, principal: McpPrincipal): Promise<unknown>;
  getUsage(principal: McpPrincipal): Promise<unknown>;
  requestScheduleSave(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestScheduleDelete(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestTriggerSave(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestTriggerDelete(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestWebhookReconcile(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestNotificationRuleCreate(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
  requestNotificationRuleDelete(
    input: Record<string, unknown>,
    principal: McpPrincipal,
  ): Promise<unknown>;
}

export type ActionExecutionContext = {
  idempotencyKey?: string;
  services?: KodyMcpActionServices;
};

const emptyInput = z.object({}).strict();
const recordId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().trim().min(1).max(5_000);
const status = z.enum([
  "planned",
  "active",
  "blocked",
  "completed",
  "cancelled",
]);
const reference = z.string().trim().min(1).max(2_000);
const createWorkInput = z
  .object({
    recordId,
    title: shortText,
    objective: longText,
    status: status.optional(),
    summary: z.string().trim().max(5_000).optional(),
    goal: shortText.optional(),
    tasks: z.array(shortText).max(100).optional(),
  })
  .strict();
const listWorkInput = z
  .object({
    status: status.optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
const getWorkInput = z.object({ recordId }).strict();
const updateWorkInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    title: shortText.optional(),
    objective: longText.optional(),
    status: status.optional(),
    summary: longText.optional(),
    goal: shortText.optional(),
    tasks: z.array(shortText).max(100).optional(),
    blockers: z.array(shortText).max(100).optional(),
  })
  .strict()
  .refine(
    ({ recordId: _recordId, expectedRevision: _revision, ...patch }) =>
      Object.keys(patch).length > 0,
  );
const checkpointInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    summary: longText,
  })
  .strict();
const evidenceInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    kind: shortText,
    reference,
    summary: longText,
  })
  .strict();
const decisionInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    summary: longText,
    rationale: longText.optional(),
  })
  .strict();
const handoffInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    toAgent: shortText,
    summary: longText,
    nextSteps: z.array(shortText).min(1).max(50),
  })
  .strict();
const artifactInput = z
  .object({
    recordId,
    expectedRevision: z.number().int().positive(),
    kind: shortText,
    reference,
    summary: longText,
  })
  .strict();
const contextSearchInput = z
  .object({
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
const definitionId = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const getDefinitionInput = z.object({ id: definitionId }).strict();
const approvalListInput = z
  .object({
    status: z
      .enum([
        "pending",
        "approving",
        "rejected",
        "dispatched",
        "failed",
        "expired",
      ])
      .optional(),
    workRecordId: recordId.optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
const approvalGetInput = z.object({ requestId: definitionId }).strict();
const workflowRunInput = z
  .object({
    workflowId: definitionId,
    workRecordId: recordId,
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const workflowResumeInput = z
  .object({
    workflowId: definitionId,
    workRecordId: recordId,
    runId: z
      .string()
      .trim()
      .regex(/^run-[a-zA-Z0-9_-]{1,123}$/),
  })
  .strict();
const capabilityRunInput = z
  .object({
    capabilityId: definitionId,
    workRecordId: recordId,
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const runListInput = z
  .object({ limit: z.number().int().min(1).max(100).default(20) })
  .strict();
const runGetInput = z
  .object({ runId: z.string().trim().min(1).max(240) })
  .strict();
const scheduleDefinition = z
  .object({
    id: definitionId,
    every: z.string().trim().min(1).max(100),
    at: z
      .object({
        time: z.string().trim().min(1).max(20),
        timezone: z.string().trim().min(1).max(100),
      })
      .strict()
      .optional(),
    target: z
      .object({
        kind: z.enum(["workflow", "capability", "pipeline", "agent"]),
        id: definitionId,
      })
      .strict(),
    input: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  })
  .strict();
const scheduleSaveInput = z
  .object({ workRecordId: recordId, schedule: scheduleDefinition })
  .strict();
const automationDeleteInput = z
  .object({ workRecordId: recordId, id: definitionId })
  .strict();
const triggerSaveInput = z
  .object({
    workRecordId: recordId,
    trigger: z.record(z.string(), z.unknown()),
  })
  .strict();
const webhookReconcileInput = z.object({ workRecordId: recordId }).strict();
const notificationRuleCreateInput = z
  .object({
    workRecordId: recordId,
    rule: NotificationCreateRuleInputSchema,
  })
  .strict();

const workOutputSchema: JsonSchema = { type: "object" };

function requireIdempotency(context: ActionExecutionContext): string {
  if (!context.idempotencyKey)
    throw new KodyActionError(
      "idempotency_key_required",
      "Write actions require an idempotency key.",
    );
  return context.idempotencyKey;
}

function requireServices(
  context: ActionExecutionContext,
): KodyMcpActionServices {
  if (!context.services)
    throw new KodyActionError(
      "service_unavailable",
      "Kody service is unavailable.",
    );
  return context.services;
}

function delegatedReadAction(input: {
  id: string;
  title: string;
  summary: string;
  category: string;
  schema?: z.ZodType;
  execute: (
    parsed: Record<string, unknown>,
    services: KodyMcpActionServices,
    principal: McpPrincipal,
  ) => Promise<unknown>;
}): InternalAction {
  const schema = input.schema ?? emptyInput;
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    category: input.category,
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: schema,
    inputSchema: toJsonSchema(schema),
    outputSchema: { type: "object" },
    examples: [],
    execute: async (parsed, principal, context) =>
      await input.execute(parsed, requireServices(context), principal),
  };
}

function approvalRequestAction(input: {
  id: string;
  title: string;
  summary: string;
  schema: z.ZodType;
  execute: (
    parsed: Record<string, unknown>,
    services: KodyMcpActionServices,
    principal: McpPrincipal,
  ) => Promise<unknown>;
}): InternalAction {
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    category: "approvals",
    permission: "approval",
    sideEffects: true,
    approval: "required",
    input: input.schema,
    inputSchema: toJsonSchema(input.schema),
    outputSchema: { type: "object" },
    examples: [],
    execute: async (parsed, principal, context) =>
      await input.execute(
        { ...parsed, idempotencyKey: requireIdempotency(context) },
        requireServices(context),
        principal,
      ),
  };
}

function workAction(
  definition: Omit<
    InternalAction,
    "category" | "permission" | "sideEffects" | "approval" | "outputSchema"
  >,
): InternalAction {
  return {
    ...definition,
    category: "work",
    permission: "write",
    sideEffects: true,
    approval: "none",
    outputSchema: workOutputSchema,
  };
}

function appendWorkAction(
  id: string,
  title: string,
  summary: string,
  input: z.ZodType,
  type:
    "update" | "checkpoint" | "evidence" | "decision" | "handoff" | "artifact",
): InternalAction {
  return workAction({
    id,
    title,
    summary,
    input,
    inputSchema: toJsonSchema(input),
    examples: [],
    execute: async (parsed, principal, context) => {
      return await requireServices(context).appendWork(
        type,
        {
          ...parsed,
          idempotencyKey: requireIdempotency(context),
          actionId: id,
        },
        principal,
      );
    },
  });
}

const INTERNAL_ACTIONS: readonly InternalAction[] = [
  {
    id: "repository.scope.get",
    title: "Get repository scope",
    summary:
      "Return the verified Kody repository and actor for this connection.",
    category: "repository",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: emptyInput,
    inputSchema: toJsonSchema(emptyInput),
    outputSchema: {
      type: "object",
      properties: {
        repository: { type: "string" },
        actor: { type: "string" },
      },
      required: ["repository", "actor"],
      additionalProperties: false,
    },
    examples: [{ input: {}, description: "Show the active Kody scope." }],
    execute: (_input, principal) => ({
      repository: principal.tenantId,
      actor: principal.actorLogin,
    }),
  },
  {
    id: "mcp.contract.get",
    title: "Get MCP work contract",
    summary:
      "Return the versioned contract agents use for Todo work, evidence, and handoffs.",
    category: "mcp",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: emptyInput,
    inputSchema: toJsonSchema(emptyInput),
    outputSchema: {
      type: "object",
      properties: {
        contractVersion: { type: "string" },
        workSystem: { type: "string" },
        workRoute: { type: "string" },
      },
      required: ["contractVersion", "workSystem", "workRoute"],
    },
    examples: [{ input: {}, description: "Inspect Kody's handoff record." }],
    execute: () => ({
      contractVersion: KODY_MCP_CONTRACT_VERSION,
      workSystem: "todos",
      workRoute: "/repo/{owner}/{repo}/todos/{recordId}",
    }),
  },
  {
    id: "dashboard.features.list",
    title: "List Kody feature families",
    summary: "List the Kody feature families currently exposed through MCP.",
    category: "dashboard",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: emptyInput,
    inputSchema: toJsonSchema(emptyInput),
    outputSchema: {
      type: "object",
      properties: { families: { type: "array", items: { type: "string" } } },
      required: ["families"],
    },
    examples: [{ input: {}, description: "See Kody's extension surface." }],
    execute: () => ({
      families: [
        "todos",
        "context",
        "policies",
        "capabilities",
        "workflows",
        "approvals",
        "automation",
        "activity",
      ],
    }),
  },
  {
    id: "work.list",
    title: "List Todo work",
    summary: "List current agent work for this repository.",
    category: "work",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: listWorkInput,
    inputSchema: toJsonSchema(listWorkInput),
    outputSchema: { type: "array", items: workOutputSchema },
    examples: [
      {
        input: { limit: 20 },
        description: "See work another agent can continue.",
      },
    ],
    execute: async (input, principal, context) =>
      await requireServices(context).listWork(input, principal),
  },
  {
    id: "work.get",
    title: "Get Todo work",
    summary: "Read one work record and its attributed activity.",
    category: "work",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: getWorkInput,
    inputSchema: toJsonSchema(getWorkInput),
    outputSchema: { type: "object" },
    examples: [
      {
        input: { recordId: "phase-3" },
        description: "Continue existing work without its raw transcript.",
      },
    ],
    execute: async (input, principal, context) =>
      await requireServices(context).getWork(String(input.recordId), principal),
  },
  workAction({
    id: "work.create",
    title: "Create Todo work",
    summary: "Create a durable Todo for agent collaboration.",
    input: createWorkInput,
    inputSchema: toJsonSchema(createWorkInput),
    examples: [
      {
        input: {
          recordId: "phase-3",
          title: "Phase 3",
          objective: "Share work",
        },
        description: "Start Todo work.",
      },
    ],
    execute: async (input, principal, context) =>
      await requireServices(context).createWork(
        {
          ...input,
          idempotencyKey: requireIdempotency(context),
          actionId: "work.create",
        },
        principal,
      ),
  }),
  appendWorkAction(
    "work.update",
    "Update Todo work",
    "Update status, summary, goals, tasks, or blockers with revision protection.",
    updateWorkInput,
    "update",
  ),
  appendWorkAction(
    "work.checkpoint.add",
    "Add checkpoint",
    "Record durable progress another agent can inspect.",
    checkpointInput,
    "checkpoint",
  ),
  appendWorkAction(
    "work.evidence.add",
    "Add evidence",
    "Attach test, deployment, commit, URL, or other proof.",
    evidenceInput,
    "evidence",
  ),
  appendWorkAction(
    "work.decision.add",
    "Add decision",
    "Record a decision and optional rationale.",
    decisionInput,
    "decision",
  ),
  appendWorkAction(
    "work.handoff.create",
    "Create handoff",
    "Tell a named next agent what is complete and what to do next.",
    handoffInput,
    "handoff",
  ),
  appendWorkAction(
    "work.artifact.add",
    "Add artifact",
    "Attach a file, commit, pull request, report, or deployment reference.",
    artifactInput,
    "artifact",
  ),
  {
    id: "context.search",
    title: "Search repository context",
    summary: "Search Kody repository memory and return revision provenance.",
    category: "context",
    permission: "read",
    sideEffects: false,
    approval: "none",
    input: contextSearchInput,
    inputSchema: toJsonSchema(contextSearchInput),
    outputSchema: { type: "object" },
    examples: [
      {
        input: { query: "MCP architecture", limit: 10 },
        description: "Recover relevant Kody knowledge.",
      },
    ],
    execute: async (input, principal) => {
      const rows = await createBackendClient().query(
        backendApi.memories.search,
        {
          actor: { kind: "user", id: `github:${principal.actorGithubId}` },
          tenantId: principal.tenantId,
          scope: { kind: "repository", tenantId: principal.tenantId },
          searchText: String(input.query),
          limit: Number(input.limit),
        },
      );
      return {
        items: (rows as Array<Record<string, any>>).map((memory) => ({
          memoryId: memory.id,
          kind: memory.kind,
          title: memory.content.title,
          summary: memory.content.summary,
          body: memory.content.body,
          revisionId: memory.currentRevisionId,
          updatedAt: memory.updatedAt,
          provenance: {
            repository: principal.tenantId,
            source: "kody-memory",
            revisionId: memory.currentRevisionId,
          },
        })),
      };
    },
  },
  delegatedReadAction({
    id: "policy.list",
    title: "List policies",
    summary: "List reusable repository policies applied by Kody.",
    category: "policies",
    execute: (_input, services, principal) => services.listPolicies(principal),
  }),
  delegatedReadAction({
    id: "policy.get",
    title: "Get policy",
    summary: "Read one repository policy and its agent scope.",
    category: "policies",
    schema: getDefinitionInput,
    execute: (input, services, principal) =>
      services.getPolicy(String(input.id), principal),
  }),
  delegatedReadAction({
    id: "instruction.get",
    title: "Get repository instructions",
    summary: "Read the instructions shared by every Kody execution.",
    category: "instructions",
    execute: (_input, services, principal) =>
      services.getInstructions(principal),
  }),
  delegatedReadAction({
    id: "capability.list",
    title: "List capabilities",
    summary: "List reusable Kody capabilities available to this repository.",
    category: "capabilities",
    execute: (_input, services, principal) =>
      services.listCapabilities(principal),
  }),
  delegatedReadAction({
    id: "capability.get",
    title: "Get capability",
    summary: "Read one Kody capability contract and instructions.",
    category: "capabilities",
    schema: getDefinitionInput,
    execute: (input, services, principal) =>
      services.getCapability(String(input.id), principal),
  }),
  delegatedReadAction({
    id: "workflow.list",
    title: "List workflows",
    summary: "List Kody Engine workflows and their approval policy.",
    category: "workflows",
    execute: (_input, services, principal) => services.listWorkflows(principal),
  }),
  delegatedReadAction({
    id: "workflow.get",
    title: "Get workflow",
    summary: "Read one workflow definition and its runnable steps.",
    category: "workflows",
    schema: getDefinitionInput,
    execute: (input, services, principal) =>
      services.getWorkflow(String(input.id), principal),
  }),
  delegatedReadAction({
    id: "quality.gates.get",
    title: "Get quality gates",
    summary: "Read repository checks used by Kody Engine runs.",
    category: "quality",
    execute: (_input, services, principal) =>
      services.getQualityGates(principal),
  }),
  delegatedReadAction({
    id: "approval.list",
    title: "List approval requests",
    summary: "List safe approval status for agent-requested execution.",
    category: "approvals",
    schema: approvalListInput,
    execute: (input, services, principal) =>
      services.listApprovals(input, principal),
  }),
  delegatedReadAction({
    id: "approval.get",
    title: "Get approval request",
    summary: "Read one approval request without its signed approval secret.",
    category: "approvals",
    schema: approvalGetInput,
    execute: (input, services, principal) =>
      services.getApproval(String(input.requestId), principal),
  }),
  approvalRequestAction({
    id: "workflow.run.request",
    title: "Request workflow run",
    summary: "Ask the user to approve a Kody Engine workflow run.",
    schema: workflowRunInput,
    execute: (input, services, principal) =>
      services.requestWorkflowRun(input, principal),
  }),
  approvalRequestAction({
    id: "workflow.resume.request",
    title: "Request workflow resume",
    summary: "Ask the user to approve resuming a paused Kody Engine workflow.",
    schema: workflowResumeInput,
    execute: (input, services, principal) =>
      services.requestWorkflowResume(input, principal),
  }),
  approvalRequestAction({
    id: "capability.run.request",
    title: "Request capability run",
    summary: "Ask the user to approve a Kody Engine capability run.",
    schema: capabilityRunInput,
    execute: (input, services, principal) =>
      services.requestCapabilityRun(input, principal),
  }),
  delegatedReadAction({
    id: "schedule.list",
    title: "List schedules",
    summary: "List online Kody schedules for this repository.",
    category: "automation",
    execute: (_input, services, principal) => services.listSchedules(principal),
  }),
  delegatedReadAction({
    id: "schedule.get",
    title: "Get schedule",
    summary: "Read one online Kody schedule.",
    category: "automation",
    schema: getDefinitionInput,
    execute: (input, services, principal) =>
      services.getSchedule(String(input.id), principal),
  }),
  delegatedReadAction({
    id: "trigger.list",
    title: "List event triggers",
    summary: "List repository events that start Kody work.",
    category: "automation",
    execute: (_input, services, principal) => services.listTriggers(principal),
  }),
  delegatedReadAction({
    id: "trigger.get",
    title: "Get event trigger",
    summary: "Read one repository event trigger.",
    category: "automation",
    schema: getDefinitionInput,
    execute: (input, services, principal) =>
      services.getTrigger(String(input.id), principal),
  }),
  delegatedReadAction({
    id: "webhook.status",
    title: "Get webhook status",
    summary: "Inspect GitHub webhook delivery health.",
    category: "automation",
    execute: (_input, services, principal) =>
      services.getWebhookStatus(principal),
  }),
  delegatedReadAction({
    id: "notification.rule.list",
    title: "List notification rules",
    summary: "List online notification rules without secret channel values.",
    category: "notifications",
    execute: (_input, services, principal) =>
      services.listNotificationRules(principal),
  }),
  delegatedReadAction({
    id: "run.list",
    title: "List remote runs",
    summary: "Monitor recent Kody Engine and Agency runs.",
    category: "monitoring",
    schema: runListInput,
    execute: (input, services, principal) =>
      services.listRuns(input, principal),
  }),
  delegatedReadAction({
    id: "run.get",
    title: "Get remote run",
    summary: "Inspect one durable Kody run.",
    category: "monitoring",
    schema: runGetInput,
    execute: (input, services, principal) =>
      services.getRun(String(input.runId), principal),
  }),
  delegatedReadAction({
    id: "mcp.usage.get",
    title: "Get MCP usage",
    summary: "Read scoped request analytics, quota, and compatibility policy.",
    category: "monitoring",
    execute: (_input, services, principal) => services.getUsage(principal),
  }),
  approvalRequestAction({
    id: "schedule.save.request",
    title: "Request schedule save",
    summary: "Ask the user to approve creating or updating an online schedule.",
    schema: scheduleSaveInput,
    execute: (input, services, principal) =>
      services.requestScheduleSave(input, principal),
  }),
  approvalRequestAction({
    id: "schedule.delete.request",
    title: "Request schedule deletion",
    summary: "Ask the user to approve deleting an online schedule.",
    schema: automationDeleteInput,
    execute: (input, services, principal) =>
      services.requestScheduleDelete(input, principal),
  }),
  approvalRequestAction({
    id: "trigger.save.request",
    title: "Request trigger save",
    summary: "Ask the user to approve creating or updating an event trigger.",
    schema: triggerSaveInput,
    execute: (input, services, principal) =>
      services.requestTriggerSave(input, principal),
  }),
  approvalRequestAction({
    id: "trigger.delete.request",
    title: "Request trigger deletion",
    summary: "Ask the user to approve deleting an event trigger.",
    schema: automationDeleteInput,
    execute: (input, services, principal) =>
      services.requestTriggerDelete(input, principal),
  }),
  approvalRequestAction({
    id: "webhook.reconcile.request",
    title: "Request webhook repair",
    summary: "Ask the user to approve registering or repairing Kody's webhook.",
    schema: webhookReconcileInput,
    execute: (input, services, principal) =>
      services.requestWebhookReconcile(input, principal),
  }),
  approvalRequestAction({
    id: "notification.rule.create.request",
    title: "Request notification rule creation",
    summary:
      "Ask the user to approve creating an online notification rule. Secret channel values stay private.",
    schema: notificationRuleCreateInput,
    execute: (input, services, principal) =>
      services.requestNotificationRuleCreate(input, principal),
  }),
  approvalRequestAction({
    id: "notification.rule.delete.request",
    title: "Request notification rule deletion",
    summary: "Ask the user to approve deleting an online notification rule.",
    schema: automationDeleteInput,
    execute: (input, services, principal) =>
      services.requestNotificationRuleDelete(input, principal),
  }),
];

function publicAction(action: InternalAction): KodyAction {
  const { input: _input, execute: _execute, ...visible } = action;
  return visible;
}

export function listKodyActions(): KodyAction[] {
  return INTERNAL_ACTIONS.map(publicAction);
}

export function getKodyAction(id: string): KodyAction | null {
  const action = INTERNAL_ACTIONS.find((candidate) => candidate.id === id);
  return action ? publicAction(action) : null;
}

export async function executeKodyAction(
  id: string,
  input: unknown,
  principal: McpPrincipal,
  context: ActionExecutionContext = {},
): Promise<unknown> {
  const action = INTERNAL_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) throw new KodyActionError("action_not_found", "Unknown action.");
  if (action.permission !== "read" && !principal.scopes.includes("mcp:execute"))
    throw new KodyActionError(
      "insufficient_scope",
      "The access token cannot execute this action.",
    );
  const parsed = action.input.safeParse(input ?? {});
  if (!parsed.success)
    throw new KodyActionError("invalid_input", "Action input is invalid.");
  return await action.execute(
    parsed.data as Record<string, unknown>,
    principal,
    context,
  );
}

export class KodyActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
