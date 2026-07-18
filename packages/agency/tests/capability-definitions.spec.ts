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
  deleteCapabilityFile,
  listLocalCapabilityFiles,
  readCapabilityFile,
  writeCapabilityFile,
} from "../src/capabilities/files";

const PROFILE = JSON.stringify({
  action: "ci-health",
  describe: "Checks CI",
  capabilityKind: "verify",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("backend capability definitions", () => {
  it("lists and reads current capability bundles", async () => {
    backend.query
      .mockResolvedValueOnce([
        {
          slug: "ci-health",
          version: "sha256:v1",
          bundle: {
            schemaVersion: 1,
            files: { "profile.json": PROFILE, "capability.md": "Check CI" },
          },
          updatedAt: "2026-07-18T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce({
        slug: "ci-health",
        version: "sha256:v1",
        bundle: {
          schemaVersion: 1,
          files: { "profile.json": PROFILE, "capability.md": "Check CI" },
        },
        updatedAt: "2026-07-18T00:00:00.000Z",
      });

    expect(await listLocalCapabilityFiles()).toMatchObject([
      { slug: "ci-health", describe: "Checks CI", source: "local" },
    ]);
    expect(await readCapabilityFile("ci-health")).toMatchObject({
      slug: "ci-health",
      prompt: "Check CI",
      capabilityKind: "verify",
    });
    expect(getFunctionName(backend.query.mock.calls[0]![0])).toBe(
      "definitions:listCurrent",
    );
    expect(getFunctionName(backend.query.mock.calls[1]![0])).toBe(
      "definitions:getCurrent",
    );
  });

  it("publishes a normalized immutable bundle and retires it", async () => {
    backend.mutation.mockResolvedValue(null);

    await writeCapabilityFile({
      fields: {
        slug: "ci-health",
        describe: "Checks CI",
        prompt: "Check CI",
        model: "",
        permissionMode: "default",
        tools: [],
        skills: [],
        shellScripts: [],
        mcpServers: [],
        landing: "comment",
      },
      skills: [],
      shellScripts: [],
    });
    await deleteCapabilityFile("ci-health");

    const publish = backend.mutation.mock.calls[0]!;
    expect(getFunctionName(publish[0])).toBe("definitions:publish");
    expect(publish[1]).toMatchObject({
      tenantId: "acme/widgets",
      kind: "capability",
      slug: "ci-health",
      version: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      bundle: {
        schemaVersion: 1,
        files: {
          "profile.json": expect.any(String),
          "capability.md": expect.stringContaining("Check CI"),
        },
      },
    });
    expect(getFunctionName(backend.mutation.mock.calls[1]![0])).toBe(
      "definitions:retire",
    );
  });
});
