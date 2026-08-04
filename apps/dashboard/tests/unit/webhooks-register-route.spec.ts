import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const webhook = vi.hoisted(() => ({
  ensureWebhook: vi.fn(),
}));

vi.mock("@kody-ade/base/auth/oauth-url", () => ({
  getPublicBaseUrl: vi.fn(() => "http://localhost:3333"),
}));

vi.mock("@dashboard/lib/webhooks/register", () => ({
  ensureWebhook: webhook.ensureWebhook,
}));

vi.mock("@kody-ade/base/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/../app/api/webhooks/register/route");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhook registration route", () => {
  it("reports a local dashboard URL as a setup requirement", async () => {
    webhook.ensureWebhook.mockResolvedValueOnce({
      ok: false,
      skipped: true,
      error: "public_url_required",
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new NextRequest("http://localhost:3333/api/webhooks/register", {
        method: "POST",
        headers: {
          "content-length": "0",
          "x-kody-token": "github_pat_test",
          "x-kody-owner": "acme",
          "x-kody-repo": "repo",
        },
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "public_url_required",
      skipped: true,
    });
  });

  it("does not let automatic reconciliation move production hooks from a preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { POST } = await loadRoute();
    const response = await POST(
      new NextRequest("https://preview.example.com/api/webhooks/register", {
        method: "POST",
        headers: {
          "content-length": "0",
          "x-kody-token": "github_pat_test",
          "x-kody-webhook-reconcile": "automatic",
        },
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "preview_environment",
      skipped: true,
    });
    expect(webhook.ensureWebhook).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
