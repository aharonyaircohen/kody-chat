import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/widgets";
const ACTOR = {
  tokenId: "token-codex",
  name: "Codex",
  actorLogin: "octocat",
  actorGithubId: 42,
};

describe("MCP workflow approval requests", () => {
  it("stores a pending request without exposing its signed approval token", async () => {
    const t = setup();
    await t.mutation(api.mcpApprovalRequests.create, {
      tenantId: TENANT,
      requestId: "approval-request-1",
      workRecordId: "phase-4",
      targetKind: "workflow",
      workflowId: "quality-run",
      runId: "run-1",
      mode: "start",
      input: { target: "main" },
      action: "run:hash",
      approvalId: "approval-1",
      approvalToken: "signed-secret-token",
      actor: ACTOR,
      idempotencyKey: "request-quality-run",
      requestHash: "request-hash",
      createdAt: "2026-09-02T08:00:00.000Z",
      expiresAt: "2026-09-02T08:15:00.000Z",
    });

    const listed = await t.query(api.mcpApprovalRequests.listForWork, {
      tenantId: TENANT,
      workRecordId: "phase-4",
      limit: 20,
    });
    expect(listed).toEqual([
      expect.objectContaining({
        requestId: "approval-request-1",
        status: "pending",
        actor: ACTOR,
      }),
    ]);
    expect(JSON.stringify(listed)).not.toContain("signed-secret-token");
  });

  it("deduplicates retries and rejects an idempotency key with different input", async () => {
    const t = setup();
    const input = {
      tenantId: TENANT,
      requestId: "approval-request-2",
      workRecordId: "phase-4",
      targetKind: "workflow" as const,
      workflowId: "quality-run",
      runId: "run-2",
      mode: "start" as const,
      input: {},
      action: "run:hash",
      approvalId: "approval-2",
      approvalToken: "signed-token",
      actor: ACTOR,
      idempotencyKey: "same-key",
      requestHash: "same-hash",
      createdAt: "2026-09-02T08:00:00.000Z",
      expiresAt: "2026-09-02T08:15:00.000Z",
    };
    const first = await t.mutation(api.mcpApprovalRequests.create, input);
    await expect(
      t.mutation(api.mcpApprovalRequests.create, input),
    ).resolves.toEqual(first);
    await expect(
      t.mutation(api.mcpApprovalRequests.create, {
        ...input,
        requestHash: "different-hash",
      }),
    ).rejects.toThrow("Idempotency key was already used with different input");
  });

  it("allows one decision and records the dispatched workflow result", async () => {
    const t = setup();
    await t.mutation(api.mcpApprovalRequests.create, {
      tenantId: TENANT,
      requestId: "approval-request-3",
      workRecordId: "phase-4",
      targetKind: "workflow",
      workflowId: "quality-run",
      runId: "run-3",
      mode: "resume",
      input: { stepId: "review" },
      action: "run:hash",
      approvalId: "approval-3",
      approvalToken: "signed-token",
      actor: ACTOR,
      idempotencyKey: "request-3",
      requestHash: "hash-3",
      createdAt: "2026-09-02T08:00:00.000Z",
      expiresAt: "2026-09-02T08:15:00.000Z",
    });

    const claimed = await t.mutation(api.mcpApprovalRequests.claimDecision, {
      tenantId: TENANT,
      requestId: "approval-request-3",
      decision: "approved",
      decidedBy: "github:42",
      decidedAt: "2026-09-02T08:05:00.000Z",
    });
    expect(claimed).toMatchObject({
      approvalToken: "signed-token",
      status: "approving",
    });
    await expect(
      t.mutation(api.mcpApprovalRequests.claimDecision, {
        tenantId: TENANT,
        requestId: "approval-request-3",
        decision: "rejected",
        decidedBy: "github:42",
        decidedAt: "2026-09-02T08:06:00.000Z",
      }),
    ).resolves.toBeNull();

    await t.mutation(api.mcpApprovalRequests.finish, {
      tenantId: TENANT,
      requestId: "approval-request-3",
      status: "dispatched",
      result: { runId: "run-3", execution: "kody-engine" },
      updatedAt: "2026-09-02T08:07:00.000Z",
    });
    await expect(
      t.query(api.mcpApprovalRequests.getPublic, {
        tenantId: TENANT,
        requestId: "approval-request-3",
      }),
    ).resolves.toMatchObject({
      status: "dispatched",
      result: { runId: "run-3", execution: "kody-engine" },
    });

    await t.mutation(api.mcpApprovalRequests.recordExecution, {
      tenantId: TENANT,
      workflowId: "quality-run",
      runId: "run-3",
      status: "success",
      summary: "Quality checks passed",
      githubRunId: "42",
      githubRunUrl: "https://github.com/acme/widgets/actions/runs/42",
      completedAt: "2026-09-02T08:09:00.000Z",
    });
    const completed = await t.query(api.mcpApprovalRequests.getPublic, {
      tenantId: TENANT,
      requestId: "approval-request-3",
    });
    expect(completed).toMatchObject({
      status: "dispatched",
      result: {
        runId: "run-3",
        execution: {
          kind: "kody-engine",
          status: "success",
          summary: "Quality checks passed",
          githubRunId: "42",
          githubRunUrl: "https://github.com/acme/widgets/actions/runs/42",
          completedAt: "2026-09-02T08:09:00.000Z",
        },
      },
    });
  });

  it("keeps approval requests repository scoped", async () => {
    const t = setup();
    await expect(
      t.query(api.mcpApprovalRequests.getPublic, {
        tenantId: "other/repo",
        requestId: "missing",
      }),
    ).resolves.toBeNull();
  });
});
