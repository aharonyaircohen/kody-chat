import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "octocat", avatar_url: "", githubId: 1 },
  })),
}));
const context = vi.hoisted(() => ({
  config: null as null | {
    token: string;
    orgSlug: string;
    defaultRegion: string;
  },
  resolveServerProviderContext: vi.fn(async () => ({
    ok: true as const,
    context: { owner: "acme", repo: "app" },
  })),
  serverProviderConfigFromContext: vi.fn(() => context.config),
}));
const provider = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({
    providerId: "fly",
    sessionId: "browser-fixed",
    appName: "kody-browser-acme-app",
    machineId: "machine-1",
    state: "started",
    region: "fra",
    endpoint: "https://kody-browser-acme-app.fly.dev",
  })),
  act: vi.fn(),
  closeSession: vi.fn(),
}));
const backend = vi.hoisted(() => ({
  query: vi.fn<() => Promise<unknown>>(async () => null),
  mutation: vi.fn(async () => null),
}));
const machineDiagnostic = vi.hoisted(() => ({
  get: vi.fn(async () => ({
    state: "started",
    checks: {},
    events: [
      { type: "start", status: "started", source: "flyd", timestamp: 1 },
    ],
    imageDigest: "sha256:safe",
  })),
}));
const browserReadiness = vi.hoisted(() => ({
  ensure: vi.fn(async () => undefined),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/fly/infrastructure/server-context", () => context);
vi.mock("@kody-ade/fly/infrastructure/browser", () => ({
  getBrowserProvider: () => provider,
  ensureBrowserSessionReady: browserReadiness.ensure,
}));
vi.mock("@kody-ade/fly/plugin/browsers", () => ({
  getBrowserMachineDiagnostic: machineDiagnostic.get,
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));
vi.mock("@kody-ade/fly/browsers/security", () => ({
  validatePublicBrowserUrl: async (url: string) => url,
}));
vi.mock("@kody-ade/fly/browsers/ticket", () => ({
  deriveBrowserKey: () => Buffer.alloc(32, 1),
  mintBrowserTicket: () => ({ ticket: "ticket-1", expiresAt: 2_000 }),
}));

import { GET, POST } from "../../app/api/kody/browser/session/route";

describe("browser session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.config = null;
  });

  it("keeps the iframe when the repository has no Fly provider token", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/kody/browser/session?actorLogin=octocat",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: "iframe",
      reason: "fly_not_configured",
    });
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(backend.query).not.toHaveBeenCalled();
  });

  it("creates a real browser through the installed provider", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    const response = await POST(
      new NextRequest("http://localhost/api/kody/browser/session", {
        method: "POST",
        body: JSON.stringify({
          operation: "start",
          actorLogin: "octocat",
          initialUrl: "https://example.com",
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "remote",
      state: "running",
      streamUrl: expect.stringContaining("wss://kody-browser-acme-app.fly.dev"),
      uploadUrl: expect.stringContaining(
        "https://kody-browser-acme-app.fly.dev/upload",
      ),
    });
    expect(provider.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "app",
        actorId: "octocat",
        initialUrl: "https://example.com",
        config: context.config,
      }),
    );
    expect(backend.mutation).toHaveBeenCalledOnce();
  });

  it("accepts only staged user-browser uploads through the action route", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    backend.query.mockResolvedValue({
      sessionId: "browser-fixed",
      providerId: "fly",
      appName: "kody-browser-acme-app",
      machineId: "machine-1",
      state: "running",
      currentUrl: "https://www.facebook.com/",
      viewport: { width: 1280, height: 720 },
      expiresAtMs: Date.now() + 60_000,
    });
    provider.act.mockResolvedValue({
      ok: true,
      url: "https://www.facebook.com/",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/kody/browser/session", {
        method: "POST",
        body: JSON.stringify({
          operation: "act",
          actorLogin: "octocat",
          sessionId: "browser-fixed",
          action: {
            type: "upload",
            selector: "input[type=file]",
            uploadId: "123e4567-e89b-42d3-a456-426614174000",
            capabilitySlug: "draft-facebook-personal-post",
            allowedOrigins: ["https://www.facebook.com"],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(provider.act).toHaveBeenCalledWith(
      expect.objectContaining({ accessTicket: "ticket-1" }),
      expect.objectContaining({
        type: "upload",
        uploadId: "123e4567-e89b-42d3-a456-426614174000",
      }),
    );
  });

  it("cleans up the previous transient app after replacement succeeds", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    backend.query.mockResolvedValueOnce({
      sessionId: "browser-fixed",
      providerId: "fly",
      appName: "old-browser-app",
      machineId: "old-machine",
      state: "running",
      currentUrl: "https://old.example.com",
      viewport: { width: 1280, height: 720 },
      expiresAtMs: Date.now() + 60_000,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/kody/browser/session", {
        method: "POST",
        body: JSON.stringify({
          operation: "start",
          actorLogin: "octocat",
          initialUrl: "https://example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(provider.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({ appName: "old-browser-app" }),
    );
  });

  it("reuses a browser that another tab just created", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    backend.query.mockResolvedValueOnce({
      sessionId: "browser-fixed",
      providerId: "fly",
      appName: "fresh-browser-app",
      machineId: "fresh-machine",
      state: "starting",
      currentUrl: "https://example.com",
      viewport: { width: 1280, height: 720 },
      expiresAtMs: Date.now() + 4 * 60 * 60 * 1_000,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/kody/browser/session", {
        method: "POST",
        body: JSON.stringify({
          operation: "start",
          actorLogin: "octocat",
          initialUrl: "https://example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(browserReadiness.ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "fresh-browser-app",
        machineId: "fresh-machine",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      sessionId: "browser-fixed",
      state: "starting",
    });
  });

  it("returns only scoped Machine startup diagnostics", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    backend.query.mockResolvedValueOnce({
      sessionId: "browser-fixed",
      providerId: "fly",
      appName: "kody-browser-acme-app",
      machineId: "machine-1",
      state: "starting",
      currentUrl: "https://example.com",
      viewport: { width: 1280, height: 720 },
      expiresAtMs: Date.now() + 60_000,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/kody/browser/session", {
        method: "POST",
        body: JSON.stringify({
          operation: "diagnose",
          actorLogin: "octocat",
          sessionId: "browser-fixed",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(machineDiagnostic.get).toHaveBeenCalledWith(
      "kody-browser-acme-app",
      "machine-1",
      context.config,
    );
    expect(JSON.stringify(await response.json())).not.toContain("fly-token");
  });

  it("diagnoses the authenticated active browser without exposing secrets", async () => {
    context.config = {
      token: "fly-token",
      orgSlug: "personal",
      defaultRegion: "fra",
    };
    backend.query.mockResolvedValueOnce({
      sessionId: "browser-fixed",
      providerId: "fly",
      appName: "kody-browser-acme-app",
      machineId: "machine-1",
      state: "starting",
      currentUrl: "https://example.com",
      viewport: { width: 1280, height: 720 },
      expiresAtMs: Date.now() + 60_000,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/kody/browser/session?actorLogin=octocat&diagnose=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(machineDiagnostic.get).toHaveBeenCalledWith(
      "kody-browser-acme-app",
      "machine-1",
      context.config,
    );
    expect(JSON.stringify(await response.json())).not.toContain("fly-token");
  });
});
