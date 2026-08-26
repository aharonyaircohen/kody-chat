import { expect, resolveLiveGitHubUser, test } from "./live-test";
import { createUserOctokit } from "@kody-ade/base/github/core";
import { listVariables, readVariables } from "@kody-ade/base/variables/store";
import { readVault } from "@kody-ade/base/vault/store";

const BASE_URL = process.env.BASE_URL ?? "";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";
const TODO_SLUG = "director-repo-ci";
const REPORT_SLUG = "director-repo-ci";

function parseRepo(value: string) {
  const path = value.includes("://") ? new URL(value).pathname : value;
  const [owner = "", repo = ""] = path.replace(/^\/+|\/+$/g, "").split("/");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

async function loginCredentials(owner: string, repo: string, token: string) {
  const [variables, vault] = await Promise.all([
    readVariables(owner, repo, { force: true }),
    readVault(createUserOctokit(token), owner, repo, { force: true }),
  ]);
  const loginUser = listVariables(variables.doc).find((value) => value.name === "LOGIN_USER")?.value;
  const loginPassword = vault.doc.secrets.LOGIN_PASSWORD?.value;
  if (!loginUser || !loginPassword) throw new Error("Live login credentials are missing");
  return { loginUser, loginPassword };
}

test("Director turns a real CI failure Report into one Todo and closes it on recovery", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  test.skip(!BASE_URL || !TEST_TOKEN || !TEST_REPO, "Requires the dedicated live repository");

  const { owner, repo } = parseRepo(TEST_REPO);
  const octokit = createUserOctokit(TEST_TOKEN);
  const repository = await octokit.repos.get({ owner, repo });
  const branch = repository.data.default_branch;
  const commit = await octokit.repos.getCommit({ owner, repo, ref: branch });
  const sha = commit.data.sha;
  const stamp = Date.now();
  const agentSlug = `director-e2e-${stamp}`;
  const intentSlug = `director-health-${stamp}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-kody-token": TEST_TOKEN,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };
  const user = await resolveLiveGitHubUser(page, BASE_URL, headers);
  headers["x-kody-user-login"] = user.login;
  const credentials = await loginCredentials(owner, repo, TEST_TOKEN);
  const auth = {
    repoUrl: TEST_REPO,
    owner,
    repo,
    token: TEST_TOKEN,
    user,
    loggedInAt: Date.now(),
    repos: [{ repoUrl: TEST_REPO, owner, repo, token: TEST_TOKEN, user, addedAt: Date.now(), isLogin: true }],
    currentRepoIndex: 0,
  };

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((value) => localStorage.setItem("kody_auth", JSON.stringify(value)), auth);

  const liveUrl = `${BASE_URL}/api/kody/agents/${agentSlug}/live`;
  const reportUrl = `${BASE_URL}/api/kody/reports/${REPORT_SLUG}`;
  const todoUrl = `${BASE_URL}/api/kody/todos/${TODO_SLUG}`;
  const baseline = new Date().toISOString();
  let createdAgent = false;
  let createdIntent = false;

  const runCycle = async () => {
    const beforeResponse = await page.request.get(liveUrl, { headers });
    const before = (await beforeResponse.json()) as { status: { state: { revision: number } | null } };
    const revision = before.status.state?.revision ?? -1;
    const run = await page.request.post(liveUrl, { headers, data: { action: "run" } });
    expect(run.status(), await run.text()).toBe(202);
    await expect.poll(async () => {
      const response = await page.request.get(liveUrl, { headers });
      if (!response.ok()) return -1;
      const body = (await response.json()) as { status?: { state?: { revision?: number } | null } };
      return body.status?.state?.revision ?? -1;
    }, { timeout: 7 * 60_000, intervals: [5_000, 10_000, 15_000] }).toBeGreaterThan(revision);
  };

  const waitForReport = async (status: "healthy" | "unhealthy", after: string) => {
    await expect.poll(async () => {
      const response = await page.request.get(reportUrl, { headers });
      if (!response.ok()) return "";
      const body = (await response.json()) as { report?: { body?: string; updatedAt?: string } };
      if (!body.report?.updatedAt || body.report.updatedAt <= after) return "";
      return body.report.body ?? "";
    }, { timeout: 7 * 60_000, intervals: [5_000, 10_000, 15_000] }).toContain(`Status:** ${status[0]!.toUpperCase()}${status.slice(1)}`);
    const response = await page.request.get(reportUrl, { headers });
    const body = (await response.json()) as { report: { updatedAt: string } };
    return body.report.updatedAt;
  };

  const waitForTodo = async (completed: boolean) => {
    await expect.poll(async () => {
      const response = await page.request.get(todoUrl, { headers });
      if (!response.ok()) return null;
      const body = (await response.json()) as { todo?: { items?: Array<{ id: string; completed: boolean }> } };
      const items = body.todo?.items ?? [];
      return { count: items.filter((item) => item.id === "finding").length, completed: items[0]?.completed };
    }, { timeout: 7 * 60_000, intervals: [5_000, 10_000, 15_000] }).toEqual({ count: 1, completed });
  };

  try {
    await page.request.delete(`${todoUrl}?actorLogin=${encodeURIComponent(user.login)}`, { headers }).catch(() => null);
    await octokit.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: "failure",
      context: "director-e2e",
      description: "Controlled Director E2E failure",
    });

    const intent = await page.request.post(`${BASE_URL}/api/kody/intents`, {
      headers,
      data: {
        slug: intentSlug,
        body: "Keep the repository healthy. Use current Reports to maintain one Todo per recurring problem and close it only after recovery evidence.",
        agent: ["*"],
        actorLogin: user.login,
      },
    });
    expect(intent.status(), await intent.text()).toBe(200);
    createdIntent = true;

    const agent = await page.request.post(`${BASE_URL}/api/kody/agents`, {
      headers,
      data: {
        slug: agentSlug,
        title: "Director E2E",
        capabilities: ["director-ci-monitor"],
        body: `# Director\n\nManage repository health from evidence. Ignore Reports at or before ${baseline}. First read the newest ${REPORT_SLUG} Report after the last handled time. If it is unhealthy, reconcile the ${TODO_SLUG} Todo as open; if healthy, reconcile that same Todo as resolved. Store the Report time in continuation state. When no unseen Report exists and no check is pending, start director-ci-monitor and record that it is pending. When a check is pending, wait for its Report. Never create another Todo for this CI problem.`,
        actorLogin: user.login,
      },
    });
    expect(agent.status(), await agent.text()).toBe(200);
    createdAgent = true;

    const activation = await page.request.post(liveUrl, {
      headers,
      data: { action: "activate", intent: intentSlug, every: "15m" },
    });
    expect(activation.status(), await activation.text()).toBe(200);

    await runCycle();
    const firstFailureReportAt = await waitForReport("unhealthy", baseline);
    await runCycle();
    await waitForTodo(false);

    await runCycle();
    const repeatedFailureReportAt = await waitForReport("unhealthy", firstFailureReportAt);
    await runCycle();
    await waitForTodo(false);

    await octokit.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: "success",
      context: "director-e2e",
      description: "Controlled Director E2E recovery",
    });
    await runCycle();
    await waitForReport("healthy", repeatedFailureReportAt);
    await runCycle();
    await waitForTodo(true);

    await page.goto(`${BASE_URL}/repo/${owner}/${repo}/reports/${REPORT_SLUG}`, { waitUntil: "domcontentloaded" });
    if (await page.getByRole("heading", { name: "Sign in to Kody" }).isVisible()) {
      await page.getByLabel("Email").fill(credentials.loginUser);
      await page.getByLabel("Password").fill(credentials.loginPassword);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(`${BASE_URL}/chat`);
      await page.goto(`${BASE_URL}/repo/${owner}/${repo}/reports/${REPORT_SLUG}`, { waitUntil: "domcontentloaded" });
    }
    await expect(page.getByRole("heading", { name: "Repository CI health" })).toBeVisible();
    await page.goto(`${BASE_URL}/repo/${owner}/${repo}/todos/${TODO_SLUG}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("checkbox")).toBeChecked();
  } finally {
    await octokit.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: "success",
      context: "director-e2e",
      description: "Director E2E cleanup",
    }).catch(() => null);
    await page.request.delete(`${todoUrl}?actorLogin=${encodeURIComponent(user.login)}`, { headers }).catch(() => null);
    if (createdAgent) {
      await page.request.delete(liveUrl, { headers }).catch(() => null);
      await page.request.delete(`${BASE_URL}/api/kody/agents/${agentSlug}?actorLogin=${encodeURIComponent(user.login)}`, { headers }).catch(() => null);
    }
    if (createdIntent) {
      await page.request.delete(`${BASE_URL}/api/kody/intents/${intentSlug}?actorLogin=${encodeURIComponent(user.login)}`, { headers }).catch(() => null);
    }
  }
});
