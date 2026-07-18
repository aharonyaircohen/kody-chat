/**
 * Unit tests for the Convex-backed agent identity store
 * (src/dashboard/lib/agent-files.ts): agents list/save/remove with the right
 * tenantId, ticked-markdown round-tripping, and capability frontmatter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));
const engineAgents = vi.hoisted(() => ({
  writeAgentFile: vi.fn(),
  deleteAgentFile: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

vi.mock("@dashboard/lib/github-client", () => ({
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));

vi.mock("@kody-ade/base/github/core", () => ({
  getOctokit: () => ({}) as never,
  invalidateStaffCache: vi.fn(),
}));

vi.mock("@kody-ade/agency/agent-files", () => ({
  listStoreAgentFiles: vi.fn(async () => []),
  writeAgentFile: engineAgents.writeAgentFile,
  deleteAgentFile: engineAgents.deleteAgentFile,
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import {
  deleteAgentFile,
  listAgentFiles,
  readAgentFile,
  writeAgentFile,
} from "@dashboard/lib/agent-files";

const RAW = [
  "---",
  "capabilities: [plan, review]",
  "---",
  "# Release Manager",
  "",
  "Owns the release train.",
  "",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  engineAgents.writeAgentFile.mockResolvedValue(undefined);
  engineAgents.deleteAgentFile.mockResolvedValue(undefined);
});

describe("agent files convex store", () => {
  it("lists agents parsed from raw ticked markdown", async () => {
    convex.query.mockResolvedValue([
      { slug: "release", body: RAW, updatedAt: "2026-07-01T00:00:00.000Z" },
    ]);

    const agents = await listAgentFiles();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      slug: "release",
      title: "Release Manager",
      source: "local",
      readOnly: false,
      capabilities: ["plan", "review"],
    });
    expect(agents[0]!.body).toContain("Owns the release train.");
    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("agents:list");
    expect(args).toEqual({ tenantId: "acme/widgets" });
  });

  it("reads one agent by slug and rejects invalid slugs", async () => {
    convex.query.mockResolvedValue([
      { slug: "release", body: RAW, updatedAt: "2026-07-01T00:00:00.000Z" },
    ]);

    expect((await readAgentFile("release"))?.slug).toBe("release");
    expect(await readAgentFile("missing")).toBeNull();
    expect(await readAgentFile("Bad Slug!")).toBeNull();
  });

  it("saves an agent via agents.save with raw markdown + frontmatter", async () => {
    convex.mutation.mockResolvedValue("id-1");

    const saved = await writeAgentFile({
      octokit: {} as never,
      slug: "release",
      title: "Release Manager",
      body: "Owns the release train.",
      capabilities: ["plan"],
    });

    expect(saved.title).toBe("Release Manager");
    expect(saved.capabilities).toEqual(["plan"]);
    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("agents:save");
    const typed = args as {
      tenantId: string;
      slug: string;
      frontmatter: unknown;
      body: string;
      updatedAt: string;
    };
    expect(typed.tenantId).toBe("acme/widgets");
    expect(typed.slug).toBe("release");
    expect(typed.frontmatter).toEqual({ capabilities: ["plan"] });
    expect(typed.body).toContain("# Release Manager");
    expect(typed.body).toContain("Owns the release train.");
  });

  it("rejects invalid slugs on write", async () => {
    await expect(
      writeAgentFile({
        octokit: {} as never,
        slug: "Bad Slug!",
        title: "x",
        body: "y",
      }),
    ).rejects.toThrow(/Invalid agent slug/);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("deletes an agent via agents.remove", async () => {
    convex.mutation.mockResolvedValue(null);

    await deleteAgentFile("release");

    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("agents:remove");
    expect(args).toEqual({ tenantId: "acme/widgets", slug: "release" });
  });
});
