import { expect, test } from "@playwright/test";

test("external host completes the supported chat integration journey", async ({
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
  await expect(
    page.getByText("Hello from external host").first(),
  ).toBeVisible();

  await composer.fill("slow");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.locator('[data-status="streaming"]')).toHaveCount(0);

  await composer.fill("fail");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("External transport failed")).toBeVisible();

  await composer.fill("navigate");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("navigation-result")).toHaveText(
    "/external/help",
  );
  await expect(page.getByTestId("plugin-event")).toHaveText("done");

  await composer.fill("context");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Context: external-demo")).toBeVisible();

  await composer.fill("unauthorized");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Unauthorized server action")).toBeVisible();

  await page.getByLabel("Attach file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("external attachment"),
  });
  await expect(page.getByText("notes.txt")).toBeVisible();
  await composer.fill("attachment");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText("Attachment received in external-demo"),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".kody-chat")).toBeVisible();
  const mobileBox = await page.locator(".kody-chat").boundingBox();
  expect(mobileBox?.width).toBeLessThanOrEqual(390);

  await page.reload();
  await expect(
    page.getByText("Hello from external host").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Attachment received in external-demo"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([
    "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
  ]);
  expect(failedRequests).toEqual([]);
});
