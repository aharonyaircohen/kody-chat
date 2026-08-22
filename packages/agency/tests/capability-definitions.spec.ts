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
    backend.query.mockImplementation((ref) => {
      const name = getFunctionName(ref);
      if (name === "definitions:listCurrent") return Promise.resolve([]);
      if (name === "definitions:getCurrent") return Promise.resolve(null);
      if (name === "repoDocs:listByPrefix")
        return Promise.resolve([
          {
            kind: "capability:ci-health",
            doc: { files: FILES },
            updatedAt: "2026-07-18T00:00:00.000Z",
          },
        ]);
      if (name === "repoDocs:get")
        return Promise.resolve({
          kind: "capability:ci-health",
          doc: { files: FILES },
          updatedAt: "2026-07-18T00:00:00.000Z",
        });
      return Promise.resolve(null);
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

  it("publishes folders for Engine hydration and retires them on delete", async () => {
    backend.mutation.mockResolvedValue(null);
    await writeCapabilityFolderFiles({ slug: "ci-health", files: FILES });
    await deleteCapabilityFile("ci-health");

    const publish = backend.mutation.mock.calls[0]!;
    expect(getFunctionName(publish[0])).toBe("definitions:publish");
    expect(publish[1]).toMatchObject({
      tenantId: "acme/widgets",
      kind: "capability",
      slug: "ci-health",
      bundle: { schemaVersion: 1, files: FILES },
      source: "local",
    });
    expect(getFunctionName(backend.mutation.mock.calls[1]![0])).toBe(
      "repoDocs:remove",
    );
    expect(getFunctionName(backend.mutation.mock.calls[2]![0])).toBe(
      "definitions:retire",
    );
    expect(getFunctionName(backend.mutation.mock.calls[3]![0])).toBe(
      "repoDocs:remove",
    );
  });

  it("prefers published definitions over legacy capability rows", async () => {
    backend.query.mockImplementation((ref) => {
      const name = getFunctionName(ref);
      if (name === "definitions:listCurrent")
        return Promise.resolve([
          {
            slug: "ci-health",
            bundle: { schemaVersion: 1, files: FILES },
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
        ]);
      if (name === "repoDocs:listByPrefix")
        return Promise.resolve([
          {
            kind: "capability:ci-health",
            doc: { files: { ...FILES, "instructions.md": "Stale\n" } },
            updatedAt: "2026-07-18T00:00:00.000Z",
          },
        ]);
      return Promise.resolve(null);
    });

    expect(await listLocalCapabilityFiles()).toEqual([
      expect.objectContaining({
        slug: "ci-health",
        describe: "Check CI and return the findings.",
        updatedAt: "2026-07-19T00:00:00.000Z",
      }),
    ]);
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

  it("accepts CMS access as an explicit runtime requirement", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          execution: "agent",
          requirements: { cms: true },
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
          requirements: { cms: "yes" },
          input: {},
          output: {},
        }),
      }),
    ).toThrow(/requirements\.cms/i);
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
