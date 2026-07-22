import { expect, test } from "@playwright/test";

test("uses the published package through a complete chat journey", async ({
  page,
}) => {
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("/");
  await expect(page.getByTestId("kody-chat-frame")).toBeVisible();

  await page.getByRole("button", { name: "New conversation" }).click();
  await page.getByLabel("Conversation title").fill("Sample conversation");
  await page.getByRole("button", { name: "Save title" }).click();

  const composer = page.getByLabel("Message");
  await composer.fill("hello package");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText("External host reply: hello package"),
  ).toBeVisible();
  await expect(page.getByTestId("host-status")).toHaveText("Last event: done");

  await page.reload();
  await page
    .getByRole("combobox", { name: "Conversation" })
    .selectOption({ label: "Sample conversation" });
  await expect(
    page.getByText("External host reply: hello package"),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
