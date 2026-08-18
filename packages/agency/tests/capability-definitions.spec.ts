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
    execution: "agent",
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

  it("accepts explicit execution and requires the deterministic entrypoint", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          secrets: ["VERCEL_ACCESS_TOKEN"],
          timeoutMs: 1_800_000,
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          timeoutMs: 999,
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).toThrow(/timeoutMs/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          secrets: ["bad-secret"],
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).toThrow(/secrets/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          secrets: ["VERCEL_ACCESS_TOKEN"],
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/script/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          input: {},
          output: {},
        }),
        "tools/run.sh": undefined as never,
      }),
    ).toThrow(/tools\/run\.sh/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "automatic",
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/execution/i);
  });

  it("accepts required specialists only for agent capabilities", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requiredSubagents: ["documentation-researcher"],
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requiredSubagents: ["Documentation Researcher"],
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/requiredSubagents/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          requiredSubagents: ["documentation-researcher"],
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).toThrow(/agent/i);
  });

  it("preserves checkpoint delivery policy only for agent capabilities", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPolicy: "checkpoint",
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          deliveryPolicy: "checkpoint",
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).toThrow(/agent/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPolicy: "automatic",
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/deliveryPolicy/i);
  });

  it("accepts narrowly scoped delivery paths for agent and script capabilities", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: [".github/workflows/**"],
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: [".kody-engine/definitions/loops/**"],
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: [".github/**"],
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/deliveryPathAllowlist/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: [".kody-engine/**"],
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/deliveryPathAllowlist/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          deliveryPathAllowlist: [".github/workflows/**"],
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).not.toThrow();
  });

  it("accepts config sections only when their config file is deliverable", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: ["kody.config.json"],
          deliveryConfigAllowlist: { "kody.config.json": ["release"] },
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "script",
          deliveryPathAllowlist: ["kody.config.json"],
          deliveryConfigAllowlist: {
            "kody.config.json": ["company.activeWorkflows"],
          },
          input: {},
          output: {},
        }),
        "tools/run.sh": "#!/bin/sh\nprintf '{}'\n",
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          deliveryPathAllowlist: [".github/workflows/**"],
          deliveryConfigAllowlist: { "kody.config.json": ["release"] },
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/deliveryConfigAllowlist/i);
  });

  it("accepts restricted browser requirements for agent capabilities", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requirements: {
            browser: true,
            qaCredentials: true,
            githubTestToken: true,
            qaAccountCredentials: ["OPENROUTER_API_KEY"],
            qaAccountModelSettings: {
              models: [{ id: "minimax/MiniMax-M3" }],
            },
            browserOnly: true,
          },
          input: {},
          output: {},
        }),
      }),
    ).not.toThrow();
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requirements: { qaCredentials: true },
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/requires browser/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requirements: { browserOnly: true },
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/requires browser/i);
  });
});
