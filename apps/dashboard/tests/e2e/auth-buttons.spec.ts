import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PW_LOCAL
  ? "http://127.0.0.1:3333"
  : (process.env.BASE_URL ?? "http://127.0.0.1:3333");

test("shows a clear error when a social provider is unavailable", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Provider not found",
        code: "PROVIDER_NOT_FOUND",
      }),
    }),
  );

  await page.goto(`${BASE_URL}/memory`);
  await page.getByRole("button", { name: "Continue with GitHub" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "GitHub sign-in is not available.",
    }),
  ).toBeVisible();
});
