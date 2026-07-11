/**
 * @fileoverview Store-linked agents are editable: PATCH materializes a repo
 * copy at .kody/agents/<slug>.md (create, sha "") that overrides the Store
 * version — this is how the built-in Kody chat identity becomes editable.
 * @testFramework vitest
 * @domain agents
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyActorLogin: vi.fn(),
  getUserOctokit: vi.fn(),
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
  readAgentFile: vi.fn(),
  readResolvedAgentFile: vi.fn(),
  writeAgentFile: vi.fn(),
  deleteAgentFile: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(),
  getRequestAuth: vi.fn(),
  verifyActorLogin: h.verifyActorLogin,
  getUserOctokit: h.getUserOctokit,
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: h.setGitHubContext,
  clearGitHubContext: h.clearGitHubContext,
}));

vi.mock("@dashboard/lib/agent-files", () => ({
  readAgentFile: h.readAgentFile,
  readResolvedAgentFile: h.readResolvedAgentFile,
  writeAgentFile: h.writeAgentFile,
  deleteAgentFile: h.deleteAgentFile,
  isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
}));

vi.mock("@dashboard/lib/activity/audit", () => ({
  recordAudit: h.recordAudit,
}));

import { PATCH } from "../../app/api/kody/agents/[slug]/route";

function request(body: Record<string, unknown>) {
  return new NextRequest("https://dash.test/api/kody/agents/kody", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-kody-token": "ghp_test-token",
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
    },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ slug: "kody" });

describe("PATCH /api/kody/agents/[slug] — store-linked agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.verifyActorLogin.mockResolvedValue("admin");
    h.getUserOctokit.mockResolvedValue({});
  });

  it("materializes a repo copy when only the Store version exists", async () => {
    // Store copy: readOnly, empty sha — writeAgentFile treats "" as create.
    h.readResolvedAgentFile.mockResolvedValue({
      slug: "kody",
      title: "Kody",
      body: "Built-in identity",
      sha: "",
      updatedAt: "2026-07-10T00:00:00Z",
      htmlUrl: "https://github.com/acme/store/blob/main/agents/kody.md",
      source: "store",
      readOnly: true,
    });
    h.writeAgentFile.mockResolvedValue({
      slug: "kody",
      title: "Kody",
      body: "Custom identity",
      sha: "abc123",
    });

    const res = await PATCH(request({ body: "Custom identity" }), { params });

    expect(res.status).toBe(200);
    expect(h.writeAgentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "kody",
        body: "Custom identity",
        sha: "",
      }),
    );
  });

  it("still 404s when the agent exists nowhere", async () => {
    h.readResolvedAgentFile.mockResolvedValue(null);

    const res = await PATCH(request({ body: "x" }), { params });

    expect(res.status).toBe(404);
    expect(h.writeAgentFile).not.toHaveBeenCalled();
  });
});
