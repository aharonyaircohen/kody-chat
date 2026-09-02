/** @testFramework playwright @domain e2e-mocked */
import { expect, test } from "@playwright/test";
import { mockKodyAccountSession } from "./support/dashboard-shell-mocks";

test("a user can inspect agent work and approve its Kody action on the repository route", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    )
      consoleErrors.push(message.text());
  });
  await mockKodyAccountSession(page, {
    id: "shared-work-e2e",
    name: "Shared Work E2E",
  });
  await page.addInitScript(() => {
    const repo = {
      repoUrl: "https://github.com/test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
      token: "ghp_placeholder",
      user: { login: "octocat", id: 1 },
      addedAt: Date.now(),
      isLogin: true,
    };
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        ...repo,
        loggedInAt: Date.now(),
        repos: [repo],
        currentRepoIndex: 0,
      }),
    );
  });
  const record = {
    recordId: "phase-3",
    repository: "test-owner/test-repo",
    title: "Shared agent work",
    objective: "Let OpenCode continue Codex work",
    status: "active",
    revision: 4,
    summary: "Persistence and API are complete.",
    goal: "Ship Phase 3",
    tasks: ["Run deployed test"],
    blockers: [],
    updatedBy: { tokenId: "opencode", name: "OpenCode", actorLogin: "octocat" },
    updatedAt: "2026-09-02T10:00:00.000Z",
    checkpoints: [
      {
        summary: "Backend passed",
        recordedAt: "2026-09-02T09:00:00.000Z",
        actor: { tokenId: "codex", name: "Codex", actorLogin: "octocat" },
      },
    ],
    evidence: [
      {
        kind: "test",
        reference: "https://example.test/results",
        summary: "Integration tests passed",
        recordedAt: "2026-09-02T09:05:00.000Z",
        actor: { tokenId: "codex", name: "Codex", actorLogin: "octocat" },
      },
    ],
    decisions: [
      {
        summary: "Reuse task state",
        rationale: "It owns repository work.",
        recordedAt: "2026-09-02T09:01:00.000Z",
        actor: { tokenId: "codex", name: "Codex", actorLogin: "octocat" },
      },
    ],
    artifacts: [
      {
        kind: "commit",
        reference: "abc123",
        summary: "Phase 3 implementation",
        recordedAt: "2026-09-02T09:10:00.000Z",
        actor: { tokenId: "codex", name: "Codex", actorLogin: "octocat" },
      },
    ],
    handoff: {
      toAgent: "OpenCode",
      summary: "Run the deployed journey",
      nextSteps: ["Call work.get", "Add final evidence"],
      recordedAt: "2026-09-02T10:00:00.000Z",
      actor: { tokenId: "opencode", name: "OpenCode", actorLogin: "octocat" },
    },
  };
  await page.route("**/api/kody/shared-work", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [record] }),
    }),
  );
  let approvalStatus = "pending";
  await page.route("**/api/kody/shared-work/phase-3", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record,
        events: [
          {
            seq: 1,
            type: "created",
            payload: {},
            actor: { tokenId: "codex", name: "Codex", actorLogin: "octocat" },
            occurredAt: "2026-09-02T09:00:00.000Z",
          },
          {
            seq: 4,
            type: "handoff",
            payload: {},
            actor: {
              tokenId: "opencode",
              name: "OpenCode",
              actorLogin: "octocat",
            },
            occurredAt: "2026-09-02T10:00:00.000Z",
          },
        ],
        approvalRequests: [
          {
            requestId: "request-phase-4",
            targetKind: "automation",
            workflowId: "daily-health",
            runId: "run-phase-4",
            mode: "start",
            status: approvalStatus,
            actor: {
              tokenId: "codex",
              name: "Codex",
              actorLogin: "octocat",
            },
            createdAt: "2026-09-02T10:05:00.000Z",
            expiresAt: "2026-09-02T10:20:00.000Z",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/kody/mcp/approvals/request-phase-4", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ decision: "approved" });
    approvalStatus = "dispatched";
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: "dispatched", runId: "run-phase-4" }),
    });
  });

  await page.goto("/repo/test-owner/test-repo/shared-work/phase-3");
  await expect(
    page.getByRole("heading", { name: "Shared Work", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shared agent work" }),
  ).toBeVisible();
  await expect(page.getByText("Updated by OpenCode (@octocat)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Handoff" })).toBeVisible();
  await expect(page.getByText("To OpenCode:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artifacts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and run" }).click();
  await expect(page.getByText("dispatched", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
