import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const backend = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));
vi.mock("@kody-ade/base/github/core", () => ({
  getOctokit: vi.fn(),
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));

import {
  assertSimpleCapabilityFolder,
  deleteCapabilityFile,
  listLocalCapabilityFiles,
  readCapabilityFile,
  writeCapabilityFolderFiles,
} from "../src/capabilities/files";

const FILES = {
  "instructions.md": "Check CI and return the findings.\n",
  "contract.json": JSON.stringify({
    input: { name: "request", schema: { type: "object" } },
    output: { name: "result", schema: { type: "object" } },
  }),
  "skills/ci/SKILL.md": "Use CI evidence.",
  "tools/check.sh": "#!/bin/sh\nexit 0\n",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("simple capability folders", () => {
  it("lists and reads the four-part folder", async () => {
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
      simpleContract: {
        input: { name: "request" },
        output: { name: "result" },
      },
      skills: [{ name: "ci/SKILL.md" }],
      capabilityTools: [{ name: "check.sh" }],
    });
  });

  it("publishes only instructions, contract, skills, and tools", async () => {
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

  it("rejects profiles, extra contract fields, and missing required files", () => {
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "profile.json": "{}",
      }),
    ).toThrow(/only allows/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        ...FILES,
        "contract.json": JSON.stringify({
          input: { name: "request", schema: {} },
          output: { name: "result", schema: {} },
          agent: "developer",
        }),
      }),
    ).toThrow(/exactly input and output/i);
    expect(() =>
      assertSimpleCapabilityFolder({
        "contract.json": FILES["contract.json"],
      }),
    ).toThrow(/instructions.md/i);
  });
});
