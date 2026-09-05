import { test, expect, resolveLiveGitHubUser } from "./live-test";

test.skip(
  process.env.KODY_SSH_UI_LIVE !== "1",
  "Opt-in real Fly inventory check",
);
test("shows SSH availability from the real machine inventory", async ({
  page,
}) => {
  const base = process.env.BASE_URL!;
  const token = process.env.E2E_GITHUB_TOKEN!;
  const repository = new URL(process.env.E2E_GITHUB_REPO!).pathname
    .replace(/^\//, "")
    .replace(/\.git$/, "");
  const [owner, repo] = repository.split("/");
  const headers = {
    "x-kody-token": token,
    "x-kody-owner": owner!,
    "x-kody-repo": repo!,
  };
  const user = await resolveLiveGitHubUser(page, base, headers);
  await page.addInitScript(
    (auth) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
    {
      repoUrl: `https://github.com/${repository}`,
      owner,
      repo,
      token,
      user,
      loggedInAt: Date.now(),
      repos: [
        {
          repoUrl: `https://github.com/${repository}`,
          owner,
          repo,
          token,
          user,
          addedAt: Date.now(),
          isLogin: true,
        },
      ],
      currentRepoIndex: 0,
    },
  );
  const inventoryResponse = await page.request.get(
    `${base}/api/kody/fly/machines`,
    { headers },
  );
  expect(
    inventoryResponse.status(),
    "Real Fly inventory must be available",
  ).toBe(200);
  const inventory = (await inventoryResponse.json()) as {
    machines: { app: string; machineId: string; sshConfigured?: boolean }[];
  };
  expect(inventory.machines.length).toBeGreaterThan(0);
  await page.goto(`${base}/repo/${owner}/${repo}/fly/machines`);
  const buttons = page.getByRole("button", {
    name: "Download SSH config",
    exact: true,
  });
  await expect(buttons).toHaveCount(inventory.machines.length, {
    timeout: 30000,
  });
  const configured = inventory.machines.filter(
    (machine) => machine.sshConfigured,
  ).length;
  await expect(buttons.locator("visible=true")).toHaveCount(
    inventory.machines.length,
  );
  expect(
    await buttons.evaluateAll(
      (elements) =>
        elements.filter((element) => !(element as HTMLButtonElement).disabled)
          .length,
    ),
  ).toBe(configured);
});
