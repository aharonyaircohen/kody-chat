import { expect, test as base, type Page } from "@playwright/test";

import {
  redactDiagnosticText,
  sanitizeDiagnosticUrl,
} from "../../scripts/live-ui-gate/core.mjs";

const SECRET_ENVIRONMENT_NAMES = [
  "E2E_GITHUB_TOKEN",
  "KODY_SERVICE_KEY",
  "KODY_MASTER_KEY",
  "KODY_BOT_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "FLY_API_TOKEN",
  "BRAIN_CHAT_API_KEY",
];

function configuredSecrets(): string[] {
  return SECRET_ENVIRONMENT_NAMES.map((name) => process.env[name] ?? "").filter(
    Boolean,
  );
}

function monitorPage(page: Page, diagnostics: string[]) {
  const secrets = configuredSecrets();
  const record = (message: string) => {
    if (diagnostics.length >= 200) return;
    diagnostics.push(redactDiagnosticText(message, secrets).slice(0, 2_000));
  };

  page.on("pageerror", (error) => record(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      record(`[console:error] ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    record(
      `[requestfailed] ${request.method()} ${sanitizeDiagnosticUrl(request.url())} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      record(
        `[response:${response.status()}] ${response.request().method()} ${sanitizeDiagnosticUrl(response.url())}`,
      );
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const expected = process.env.BASE_URL;
    if (!expected) return;
    try {
      if (new URL(frame.url()).origin !== new URL(expected).origin) {
        record(
          `[navigation] unexpected origin ${sanitizeDiagnosticUrl(frame.url())}`,
        );
      }
    } catch {
      record("[navigation] invalid target URL");
    }
  });
}

export const test = base.extend<{ livePageMonitoring: void }>({
  livePageMonitoring: [
    async ({ page }, use, testInfo) => {
      const diagnostics: string[] = [];
      monitorPage(page, diagnostics);
      await use();

      if (diagnostics.length === 0) return;
      await testInfo.attach("live-browser-diagnostics", {
        body: Buffer.from(`${JSON.stringify(diagnostics, null, 2)}\n`),
        contentType: "application/json",
      });

      if (testInfo.errors.length === 0) {
        throw new Error(
          `Live browser monitoring found ${diagnostics.length} unexpected error${diagnostics.length === 1 ? "" : "s"}`,
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
