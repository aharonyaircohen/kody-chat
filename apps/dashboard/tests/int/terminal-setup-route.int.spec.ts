import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async (): Promise<Response | null> => null),
}));
const context = vi.hoisted(() => ({
  resolveServerProviderContext: vi.fn(async () => ({
    ok: true,
    context: {
      owner: "acme",
      repo: "widgets",
      account: "octocat",
      githubToken: "gh-token",
      flyToken: "fly-token",
      flyOrgSlug: "personal",
      flyDefaultRegion: "fra",
    },
  })),
}));
const commands = vi.hoisted(() => ({
  manageBrainServer: vi.fn(async () => ({
    ok: true,
    app: "kody-brain-octocat",
    machineId: "brain-new",
    bridgeApp: "kody-terminal",
  })),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/fly/infrastructure/server-context", () => context);
vi.mock("@kody-ade/brain/server-commands", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@kody-ade/brain/server-commands")
  >();
  return { ...original, manageBrainServer: commands.manageBrainServer };
});

import { POST } from "../../app/api/kody/terminal/setup/route";

describe("POST /api/kody/terminal/setup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires auth before changing a Brain runtime", async () => {
    auth.requireKodyAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    const response = await POST(
      new NextRequest("https://dash.test/api/kody/terminal/setup", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(commands.manageBrainServer).not.toHaveBeenCalled();
  });

  it("runs the explicit terminal setup command for the active repository", async () => {
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/terminal/setup", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      machineId: "brain-new",
      bridgeApp: "kody-terminal",
    });
    expect(commands.manageBrainServer).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "setup-terminal",
        context: expect.objectContaining({ owner: "acme", repo: "widgets" }),
      }),
    );
  });
});
