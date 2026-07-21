import { expect, test } from "@playwright/test";

test("external host sends, streams, cancels, and restores chat", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("http://127.0.0.1:4178");
  await expect(
    page.getByRole("banner").or(page.getByText("External Kody Chat")),
  ).toBeVisible();

  const composer = page.getByLabel("Message");
  await composer.fill("hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello from external host")).toBeVisible();

  await composer.fill("slow");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.locator('[data-status="streaming"]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Hello from external host")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
