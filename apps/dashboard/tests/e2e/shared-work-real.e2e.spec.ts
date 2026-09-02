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
const SERVICE_KEY = process.env.KODY_SERVICE_KEY ?? "";

function parseRepo(value: string) {
  const path = value.includes("://") ? new URL(value).pathname : value;
  const [owner = "", repo = ""] = path.replace(/^\/+|\/+$/g, "").split("/");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

test("shows a real MCP cross-agent handoff from Convex on the repository page", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO || !CONVEX_URL || !SERVICE_KEY,
    "Requires live Dashboard, repository, and Convex credentials",
  );
  const { owner, repo } = parseRepo(TEST_REPO);
  const repository = `${owner}/${repo}`;
  const dashboardHeaders = {
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
  const user = await resolveLiveGitHubUser(page, BASE_URL, dashboardHeaders);
  await page.context().addInitScript(
    ({ auth }) => {
      localStorage.clear();
      localStorage.setItem("kody_auth", JSON.stringify(auth));
    },
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

  const recordId = `ui-live-${randomUUID()}`;
  const tokenIds: string[] = [];
  let approvalRequestId = "";
  const backend = createBackendClient(CONVEX_URL);
  const issueToken = async (name: string) => {
    const response = await page.request.post(
      `${BASE_URL}/api/kody/mcp/tokens`,
      { headers: dashboardHeaders, data: { name, expiresInDays: 1 } },
    );
    expect(response.status()).toBe(201);
    const body = await response.json();
    tokenIds.push(body.token.tokenId);
    return body.accessToken as string;
  };
  const call = async (
    token: string,
    id: string,
    actionId: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
  ) => {
    const response = await page.request.post(`${BASE_URL}/api/kody/mcp`, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: {
          name: "kody_execute_tool",
          arguments: {
            actionId,
            input,
            ...(idempotencyKey ? { idempotencyKey } : {}),
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
    const codex = await issueToken("Codex live UI");
    const openCode = await issueToken("OpenCode live UI");
    await call(
      codex,
      "create",
      "work.create",
      {
        recordId,
        title: "Live shared work",
        objective: "Show one local agent continuing another agent's work",
        summary: "Codex created the implementation record.",
        tasks: ["Inspect Kody work", "Continue the handoff"],
      },
      `create-${recordId}`,
    );
    await call(
      codex,
      "evidence",
      "work.evidence.add",
      {
        recordId,
        expectedRevision: 1,
        kind: "test",
        reference: "live:mcp",
        summary: "Codex wrote this through Kody MCP",
      },
      `evidence-${recordId}`,
    );
    const capabilities = (await call(
      codex,
      "capabilities",
      "capability.list",
      {},
    )) as Array<{ id?: string; slug?: string }>;
    const capability = ["health-check", "ci-health-check", "release-gate-probe"]
      .map((id) => capabilities.find((item) => (item.slug ?? item.id) === id))
      .find(Boolean);
    expect(capability).toBeTruthy();
    const capabilityId = capability?.slug ?? capability?.id ?? "";
    const approval = await call(
      codex,
      "request-capability",
      "capability.run.request",
      { workRecordId: recordId, capabilityId, input: {} },
      `request-capability-${recordId}`,
    );
    approvalRequestId = approval.requestId;
    expect(approval.status).toBe("pending");
    expect(JSON.stringify(approval)).not.toContain("approvalToken");

    await page.goto(
      `${BASE_URL}/repo/${owner}/${repo}/shared-work/${recordId}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByRole("heading", { name: "Shared Work", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Live shared work" }),
    ).toBeVisible();
    await expect(
      page.getByText("Codex wrote this through Kody MCP"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Approvals" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve and run" }).click();
    await expect(page.getByText("dispatched", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await call(
      openCode,
      "handoff",
      "work.handoff.create",
      {
        recordId,
        expectedRevision: 2,
        toAgent: "Hermes",
        summary: "OpenCode continued Codex work",
        nextSteps: ["Verify the deployed page"],
      },
      `handoff-${recordId}`,
    );
    await expect(page.getByRole("heading", { name: "Handoff" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("OpenCode continued Codex work")).toBeVisible();
    await expect(
      page.getByText("Updated by OpenCode live UI (@"),
    ).toBeVisible();
  } finally {
    if (approvalRequestId)
      await backend.mutation(backendApi.mcpApprovalRequests.remove, {
        tenantId: repository,
        requestId: approvalRequestId,
      });
    await backend.mutation(backendApi.sharedWork.remove, {
      tenantId: repository,
      recordId,
    });
    for (const tokenId of tokenIds) {
      await page.request.delete(`${BASE_URL}/api/kody/mcp/tokens`, {
        headers: dashboardHeaders,
        data: { tokenId },
      });
    }
  }
});
