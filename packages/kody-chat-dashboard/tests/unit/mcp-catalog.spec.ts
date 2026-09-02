import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeKodyAction,
  getKodyAction,
  listKodyActions,
} from "../../src/dashboard/lib/mcp/catalog";
import type { McpPrincipal } from "../../src/dashboard/lib/mcp/contracts";

const backend = { query: vi.fn(), mutation: vi.fn() };
const services = {
  listPolicies: vi.fn(),
  getPolicy: vi.fn(),
  getInstructions: vi.fn(),
  listCapabilities: vi.fn(),
  getCapability: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  getQualityGates: vi.fn(),
  listApprovals: vi.fn(),
  getApproval: vi.fn(),
  requestWorkflowRun: vi.fn(),
  requestWorkflowResume: vi.fn(),
  requestCapabilityRun: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  listTriggers: vi.fn(),
  getTrigger: vi.fn(),
  getWebhookStatus: vi.fn(),
  listNotificationRules: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getUsage: vi.fn(),
  requestScheduleSave: vi.fn(),
  requestScheduleDelete: vi.fn(),
  requestTriggerSave: vi.fn(),
  requestTriggerDelete: vi.fn(),
  requestWebhookReconcile: vi.fn(),
};

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

const principal: McpPrincipal = {
  tokenId: "token-1",
  name: "Test",
  tenantId: "acme/widgets",
  actorLogin: "octocat",
  actorGithubId: 42,
  scopes: ["mcp:read", "mcp:execute"],
  createdAt: "2026-09-02T08:00:00.000Z",
  expiresAt: "2026-10-02T08:00:00.000Z",
};

describe("public MCP action catalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes safe metadata without internal executors", () => {
    const actions = listKodyActions();
    expect(actions.map((action) => action.id)).toEqual([
      "repository.scope.get",
      "mcp.contract.get",
      "dashboard.features.list",
      "work.list",
      "work.get",
      "work.create",
      "work.update",
      "work.checkpoint.add",
      "work.evidence.add",
      "work.decision.add",
      "work.handoff.create",
      "work.artifact.add",
      "context.search",
      "policy.list",
      "policy.get",
      "instruction.get",
      "capability.list",
      "capability.get",
      "workflow.list",
      "workflow.get",
      "quality.gates.get",
      "approval.list",
      "approval.get",
      "workflow.run.request",
      "workflow.resume.request",
      "capability.run.request",
      "schedule.list",
      "schedule.get",
      "trigger.list",
      "trigger.get",
      "webhook.status",
      "notification.rule.list",
      "run.list",
      "run.get",
      "mcp.usage.get",
      "schedule.save.request",
      "schedule.delete.request",
      "trigger.save.request",
      "trigger.delete.request",
      "webhook.reconcile.request",
    ]);
    expect(actions[0]).not.toHaveProperty("execute");
    expect(actions[0]).not.toHaveProperty("input");
    expect(getKodyAction("missing")).toBeNull();
  });

  it("persists attributed work with durable idempotency context", async () => {
    backend.mutation.mockResolvedValue({ recordId: "phase-3", revision: 1 });
    await expect(
      executeKodyAction(
        "work.create",
        { recordId: "phase-3", title: "Phase 3", objective: "Share work" },
        principal,
        { idempotencyKey: "create-phase-3" },
      ),
    ).resolves.toEqual({ recordId: "phase-3", revision: 1 });
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        actor: { tokenId: "token-1", name: "Test", actorLogin: "octocat" },
        idempotencyKey: "create-phase-3",
        requestHash: expect.any(String),
      }),
    );
  });

  it("returns repository memory with revision provenance", async () => {
    backend.query.mockResolvedValue([
      {
        id: "memory-1",
        kind: "decision",
        content: { title: "Use MCP", summary: "One URL", body: "Details" },
        currentRevisionId: "revision-2",
        updatedAt: "2026-09-02T09:00:00.000Z",
      },
    ]);
    await expect(
      executeKodyAction(
        "context.search",
        { query: "MCP", limit: 5 },
        principal,
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          memoryId: "memory-1",
          revisionId: "revision-2",
        }),
      ],
    });
  });

  it("executes all initial read-only actions under verified scope", async () => {
    await expect(
      executeKodyAction("repository.scope.get", {}, principal),
    ).resolves.toEqual({ repository: "acme/widgets", actor: "octocat" });
    await expect(
      executeKodyAction("mcp.contract.get", {}, principal),
    ).resolves.toMatchObject({
      contractVersion: "2026-09-02.6",
      sharedWorkRecordSchema: { type: "object" },
    });
    await expect(
      executeKodyAction("dashboard.features.list", {}, principal),
    ).resolves.toMatchObject({
      families: expect.arrayContaining([
        "work and evidence",
        "online automation",
      ]),
    });
  });

  it("rejects unknown actions and invalid action input without leaking details", async () => {
    await expect(executeKodyAction("missing", {}, principal)).rejects.toEqual(
      expect.objectContaining({
        code: "action_not_found",
        message: "Unknown action.",
      }),
    );
    await expect(
      executeKodyAction("repository.scope.get", { extra: true }, principal),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invalid_input",
        message: "Action input is invalid.",
      }),
    );
  });

  it("reads Phase 4 definitions through the existing scoped services", async () => {
    services.listPolicies.mockResolvedValue([{ slug: "safe-changes" }]);
    services.getInstructions.mockResolvedValue({ body: "Keep tests green" });
    services.listWorkflows.mockResolvedValue([{ id: "quality-run" }]);
    await expect(
      executeKodyAction("policy.list", {}, principal, { services }),
    ).resolves.toEqual([{ slug: "safe-changes" }]);
    await expect(
      executeKodyAction("instruction.get", {}, principal, { services }),
    ).resolves.toEqual({ body: "Keep tests green" });
    await expect(
      executeKodyAction("workflow.list", {}, principal, { services }),
    ).resolves.toEqual([{ id: "quality-run" }]);
    expect(services.listPolicies).toHaveBeenCalledWith(principal);
    expect(services.getInstructions).toHaveBeenCalledWith(principal);
    expect(services.listWorkflows).toHaveBeenCalledWith(principal);
  });

  it("creates a durable approval request instead of letting an agent self-approve", async () => {
    services.requestWorkflowRun.mockResolvedValue({
      requestId: "approval-request-1",
      status: "pending",
      workflowId: "quality-run",
      runId: "run-1",
    });
    const result = await executeKodyAction(
      "workflow.run.request",
      {
        workflowId: "quality-run",
        workRecordId: "phase-4",
        input: { target: "main" },
      },
      principal,
      { idempotencyKey: "request-quality-run", services },
    );
    expect(result).toMatchObject({ status: "pending", runId: "run-1" });
    expect(services.requestWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "quality-run",
        workRecordId: "phase-4",
        idempotencyKey: "request-quality-run",
      }),
      principal,
    );
    expect(getKodyAction("workflow.run.request")).toMatchObject({
      permission: "approval",
      approval: "required",
      sideEffects: true,
    });
  });

  it("fails closed when Phase 4 services are unavailable", async () => {
    await expect(
      executeKodyAction("policy.list", {}, principal),
    ).rejects.toMatchObject({
      code: "service_unavailable",
      message: "Kody service is unavailable.",
    });
  });

  it("exposes online automation and monitoring through existing Kody services", async () => {
    services.listSchedules.mockResolvedValue([{ id: "daily", enabled: true }]);
    services.getWebhookStatus.mockResolvedValue({ level: "ok" });
    services.getUsage.mockResolvedValue({ requests: 12, limitPerMinute: 120 });
    await expect(
      executeKodyAction("schedule.list", {}, principal, { services }),
    ).resolves.toEqual([{ id: "daily", enabled: true }]);
    await expect(
      executeKodyAction("webhook.status", {}, principal, { services }),
    ).resolves.toEqual({ level: "ok" });
    await expect(
      executeKodyAction("mcp.usage.get", {}, principal, { services }),
    ).resolves.toEqual({ requests: 12, limitPerMinute: 120 });
  });

  it("turns remote schedule changes into user approval requests", async () => {
    services.requestScheduleSave.mockResolvedValue({
      requestId: "request-schedule",
      status: "pending",
    });
    await expect(
      executeKodyAction(
        "schedule.save.request",
        {
          workRecordId: "phase-5",
          schedule: {
            id: "daily-health",
            every: "1d",
            target: { kind: "capability", id: "ci-health-check" },
            input: {},
            enabled: true,
          },
        },
        principal,
        { idempotencyKey: "schedule-save", services },
      ),
    ).resolves.toMatchObject({ status: "pending" });
    expect(getKodyAction("schedule.save.request")).toMatchObject({
      permission: "approval",
      approval: "required",
    });
  });
});
