import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

vi.mock("../../src/github", () => ({
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));

import { _resetConvexClient } from "@kody-ade/base/backend/convex";
import {
  deleteGuidanceFile,
  invalidateGuidancePromptCache,
  listGuidanceFiles,
  loadGuidanceForPrompt,
  writeGuidanceFile,
} from "../../src/guidance/files";

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  invalidateGuidancePromptCache();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("agent guidance store", () => {
  it.each(["constraint", "policy"] as const)(
    "stores %s entries in an isolated namespace",
    async (kind) => {
      convex.mutation.mockResolvedValue("id-1");

      await writeGuidanceFile(kind, {
        slug: "safe-releases",
        body: "Require passing checks.",
        agent: ["kody", "qa-engineer"],
      });

      const [ref, args] = convex.mutation.mock.calls[0]!;
      expect(getFunctionName(ref)).toBe("repoDocs:save");
      expect(args).toMatchObject({
        tenantId: "acme/widgets",
        kind: `${kind}:safe-releases`,
      });
      expect((args as { doc: { body: string } }).doc.body).toContain(
        "agent: [kody, qa-engineer]",
      );
    },
  );

  it("loads only entries assigned to the requested agent", async () => {
    convex.query.mockResolvedValue([
      {
        kind: "constraint:no-force-push",
        doc: { body: "---\nagent: [kody]\n---\n\nNever force push." },
        updatedAt: "t",
      },
      {
        kind: "constraint:qa-only",
        doc: { body: "---\nagent: [qa-engineer]\n---\n\nRun visual QA." },
        updatedAt: "t",
      },
    ]);

    const prompt = await loadGuidanceForPrompt("constraint", "kody");

    expect(prompt).toContain("### no-force-push");
    expect(prompt).not.toContain("Run visual QA");
    const [, args] = convex.query.mock.calls[0]!;
    expect(args).toMatchObject({ prefix: "constraint:" });
  });

  it("lists and deletes policy entries without touching other guidance", async () => {
    convex.query.mockResolvedValue([]);
    await listGuidanceFiles("policy");
    expect(convex.query.mock.calls[0]![1]).toMatchObject({ prefix: "policy:" });

    await deleteGuidanceFile("policy", "release-approval");
    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("repoDocs:remove");
    expect(args).toMatchObject({ kind: "policy:release-approval" });
  });
});
