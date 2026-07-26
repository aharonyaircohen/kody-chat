import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const backend = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));
const storeAssets = vi.hoisted(() => ({
  listSlugs: vi.fn(),
  listDirectory: vi.fn(),
  readText: vi.fn(),
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));
vi.mock("@kody-ade/base/github/core", () => ({
  getOctokit: vi.fn(),
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));
vi.mock("@kody-ade/base/company-store/assets", () => ({
  buildCompanyStoreHtmlUrl: (_type: string, slug: string) =>
    `https://store.example/capabilities/${slug}`,
  companyStoreAssetPath: vi.fn(),
  listCompanyStoreAssetSlugs: storeAssets.listSlugs,
  listCompanyStoreDirectorySafe: storeAssets.listDirectory,
  mergeAssetsBySlug: (local: unknown[], store: unknown[]) => [
    ...local,
    ...store,
  ],
  readCompanyStoreText: storeAssets.readText,
}));

import {
  assertSimpleCapabilityFolder,
  deleteCapabilityFile,
  listLocalCapabilityFiles,
  listStoreCapabilityFiles,
  readCapabilityFile,
  writeCapabilityFolderFiles,
} from "../src/capabilities/files";

const FILES = {
  "instructions.md": "Check CI and return the findings.\n",
  "contract.json": JSON.stringify({
    input: { type: "object" },
    output: {
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
    },
  }),
  "skills/ci/SKILL.md": "Use CI evidence.",
  "tools/check.sh": "#!/bin/sh\nexit 0\n",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("simple capability folders", () => {
  it("lists and reads the folder", async () => {
    backend.query
      .mockResolvedValueOnce([
        {
          kind: "capability:ci-health",
          doc: { files: FILES },
          updatedAt: "2026-07-18T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce({
        kind: "capability:ci-health",
        doc: { files: FILES },
        updatedAt: "2026-07-18T00:00:00.000Z",
      });

    expect(await listLocalCapabilityFiles()).toMatchObject([
      { slug: "ci-health", source: "local", readOnly: false },
    ]);
    expect(await readCapabilityFile("ci-health")).toMatchObject({
      slug: "ci-health",
      instructions: "Check CI and return the findings.\n",
      contract: FILES["contract.json"],
      skills: [{ name: "ci/SKILL.md" }],
      capabilityTools: [{ name: "check.sh" }],
    });
  });

  it("publishes only instructions, skills, and tools", async () => {
    backend.mutation.mockResolvedValue(null);
    await writeCapabilityFolderFiles({ slug: "ci-health", files: FILES });
    await deleteCapabilityFile("ci-health");

    const publish = backend.mutation.mock.calls[0]!;
    expect(getFunctionName(publish[0])).toBe("repoDocs:save");
    expect(publish[1]).toMatchObject({
      tenantId: "acme/widgets",
      kind: "capability:ci-health",
      doc: { files: FILES },
    });
    expect(getFunctionName(backend.mutation.mock.calls[1]![0])).toBe(
      "repoDocs:remove",
    );
  });

  it("lists Store folders without reading every folder", async () => {
    storeAssets.listSlugs.mockResolvedValue(["ci-health", "release"]);

    expect(
      await listStoreCapabilityFiles({} as never, new Set(["ci-health"])),
    ).toEqual([
      {
        slug: "release",
        describe: "Run release",
        updatedAt: null,
        htmlUrl: "https://store.example/capabilities/release",
        source: "store",
        readOnly: true,
      },
    ]);
    expect(storeAssets.listDirectory).not.toHaveBeenCalled();
    expect(storeAssets.readText).not.toHaveBeenCalled();
  });

  it("accepts contracts but rejects profiles and missing instructions", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "profile.json": "{}",
      }),
    ).toThrow(/only allows/i);
    expect(() => assertSimpleCapabilityFolder(FILES)).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": "{}",
      }),
    ).toThrow(/input.*output/i);
    expect(() => assertSimpleCapabilityFolder({})).toThrow(/instructions.md/i);
  });
});
