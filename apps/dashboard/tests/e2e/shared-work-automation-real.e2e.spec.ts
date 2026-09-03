import { randomUUID } from "node:crypto";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { expect, resolveLiveGitHubUser, test } from "./live-test";
import {
  establishLiveKodyAccountSession,
  loadLiveKodyAccountCredentials,
} from "./live-account-session";

const BASE_URL = process.env.BASE_URL ?? "";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";
const CONVEX_URL = process.env.CONVEX_URL ?? "";
const CLEANUP_CONVEX_URL = process.env.E2E_CONVEX_URL ?? CONVEX_URL;
const SERVICE_KEY = process.env.KODY_SERVICE_KEY ?? "";

function parseRepo(value: string) {
  const path = value.includes("://") ? new URL(value).pathname : value;
  const [owner = "", repo = ""] = path.replace(/^\/+|\/+$/g, "").split("/");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

test("approves a real MCP automation change from Shared Work", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO || !CONVEX_URL || !SERVICE_KEY,
    "Requires live Dashboard, repository, and Convex credentials",
  );
  const { owner, repo } = parseRepo(TEST_REPO);
  const repository = `${owner}/${repo}`;
  const headers = {
    "content-type": "application/json",
    "x-kody-token": TEST_TOKEN,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };
  await establishLiveKodyAccountSession(
    page.request,
    BASE_URL,
    await loadLiveKodyAccountCredentials(process.env),
  );
  const user = await resolveLiveGitHubUser(page, BASE_URL, headers);
  await page
    .context()
    .addInitScript(
      ({ auth }) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
      {
        auth: {
          repoUrl: TEST_REPO,
          owner,
          repo,
          token: TEST_TOKEN,
          user,
          loggedInAt: Date.now(),
        },
      },
    );

  const recordId = `automation-ui-${randomUUID()}`;
  const scheduleId = `automation-ui-${randomUUID()}`;
  let tokenId = "";
  let requestId = "";
  const backend = createBackendClient(CLEANUP_CONVEX_URL);
  const call = async (
    accessToken: string,
    actionId: string,
    input: Record<string, unknown>,
  ) => {
    const response = await page.request.post(`${BASE_URL}/api/kody/mcp`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      data: {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: {
          name: "kody_execute_tool",
          arguments: {
            actionId,
            input,
            idempotencyKey: `${actionId}-${recordId}`,
          },
        },
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.result.isError).toBe(false);
    return body.result.structuredContent;
  };

  try {
    const issued = await page.request.post(`${BASE_URL}/api/kody/mcp/tokens`, {
      headers,
      data: { name: "Codex automation UI", expiresInDays: 1 },
    });
    expect(issued.status()).toBe(201);
    const issuedBody = await issued.json();
    tokenId = issuedBody.token.tokenId;
    const accessToken = issuedBody.accessToken as string;

    await call(accessToken, "work.create", {
      recordId,
      title: "Live automation approval",
      objective: "Prove a user controls remote automation changes",
      tasks: ["Review the requested schedule", "Approve the change"],
    });
    const approval = await call(accessToken, "schedule.save.request", {
      workRecordId: recordId,
      schedule: {
        id: scheduleId,
        every: "24h",
        target: { kind: "capability", id: "ci-health-check" },
        input: {},
        enabled: false,
      },
    });
    requestId = approval.requestId;
    expect(approval.status).toBe("pending");

    await page.goto(
      `${BASE_URL}/repo/${owner}/${repo}/shared-work/${recordId}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByRole("heading", { name: "Live automation approval" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Run automation /)).toBeVisible();
    const approvalDetails = page.getByText(new RegExp(`id: ${scheduleId}`));
    await expect(approvalDetails).toContainText("every: 24h");
    await expect(approvalDetails).toContainText("enabled: false");
    await expect(approvalDetails).toContainText("targetType: capability");
    await expect(approvalDetails).toContainText("targetId: ci-health-check");
    await page.getByRole("button", { name: "Approve and run" }).click();
    await expect(page.getByText("dispatched", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const saved = await call(accessToken, "schedule.get", { id: scheduleId });
    expect(saved).toMatchObject({ id: scheduleId, enabled: false });

    const activityResponse = await page.request.get(
      `${BASE_URL}/api/kody/activity/agents?limit=100`,
      { headers },
    );
    expect(activityResponse.status()).toBe(200);
    const activity = await activityResponse.json();
    const activityRun = activity.runs.find((run: { approvals?: unknown[] }) =>
      run.approvals?.some(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "requestId" in item &&
          item.requestId === requestId,
      ),
    );
    expect(activityRun?.runId).toBeTruthy();
    await page.goto(
      `${BASE_URL}/repo/${owner}/${repo}/activity/agents/${activityRun.runId}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByRole("heading", { name: "Live automation approval" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Automation completed", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete(`${BASE_URL}/api/kody/loops/${scheduleId}`, {
      headers,
    });
    if (requestId)
      await backend.mutation(backendApi.mcpApprovalRequests.remove, {
        tenantId: repository,
        requestId,
      });
    await backend.mutation(backendApi.sharedWork.remove, {
      tenantId: repository,
      recordId,
    });
    if (tokenId)
      await page.request.delete(`${BASE_URL}/api/kody/mcp/tokens`, {
        headers,
        data: { tokenId },
      });
  }
});
