/**
 * Unit tests for the Convex-backed reports read model
 * (src/dashboard/lib/reports-files.ts): reports.list with the right
 * tenantId, flat vs run-family grouping, run selection, and frontmatter
 * parsing on doc bodies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
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

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import {
  listReportFiles,
  readReportFile,
} from "@dashboard/lib/reports-files";

const FLAT_DOC = {
  slug: "health",
  body: "# Health Report\n\nAll systems nominal.\n",
  meta: {},
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const RUN_OLD = {
  slug: "loop-review",
  runId: "2026-06-30T10-00-00Z",
  body: "# Loop Review\n\nOld run.\n",
  meta: {},
  updatedAt: "2026-06-30T10:00:00.000Z",
};

const RUN_NEW = {
  slug: "loop-review",
  runId: "2026-07-02T10-00-00Z",
  body: [
    "---",
    "generatedAt: 2026-07-02T10:00:00Z",
    "reportType: loop-review",
    "producer:",
    "  model: claude",
    "  capability: reviewer",
    "---",
    "# Loop Review",
    "",
    "New run.",
    "",
  ].join("\n"),
  meta: {},
  updatedAt: "2026-07-02T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  convex.query.mockResolvedValue([FLAT_DOC, RUN_OLD, RUN_NEW]);
});

describe("listReportFiles", () => {
  it("queries reports.list scoped to the tenant", async () => {
    await listReportFiles();
    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("reports:list");
    expect(args).toEqual({ tenantId: "acme/widgets" });
  });

  it("returns one entry per family, run families at their newest run", async () => {
    const reports = await listReportFiles();
    expect(reports.map((r) => r.slug)).toEqual(["loop-review", "health"]);

    const family = reports[0]!;
    expect(family.runId).toBe("2026-07-02T10-00-00Z");
    expect(family.runs.map((run) => run.id)).toEqual([
      "2026-07-02T10-00-00Z",
      "2026-06-30T10-00-00Z",
    ]);
    expect(family.body).toContain("New run.");
  });

  it("parses frontmatter into report metadata", async () => {
    const reports = await listReportFiles();
    const family = reports.find((r) => r.slug === "loop-review")!;
    expect(family.title).toBe("Loop Review");
    expect(family.reportType).toBe("loop-review");
    expect(family.producer).toEqual({
      model: "claude",
      capability: "reviewer",
    });
    expect(family.updatedAt).toBe("2026-07-02T10:00:00Z");
  });

  it("derives titles and bodies from flat docs without frontmatter", async () => {
    const reports = await listReportFiles();
    const flat = reports.find((r) => r.slug === "health")!;
    expect(flat.title).toBe("Health Report");
    expect(flat.body).toBe("All systems nominal.\n");
    expect(flat.runId).toBeNull();
    expect(flat.runs).toEqual([]);
    expect(flat.updatedAt).toBe(FLAT_DOC.updatedAt);
  });
});

describe("readReportFile", () => {
  it("reads a flat report by slug", async () => {
    const report = await readReportFile("health");
    expect(report?.slug).toBe("health");
    expect(report?.body).toContain("All systems nominal");
  });

  it("defaults run families to the newest run", async () => {
    const report = await readReportFile("loop-review");
    expect(report?.runId).toBe("2026-07-02T10-00-00Z");
  });

  it("reads a specific historical run when requested", async () => {
    const report = await readReportFile("loop-review", "2026-06-30T10-00-00Z");
    expect(report?.runId).toBe("2026-06-30T10-00-00Z");
    expect(report?.body).toContain("Old run.");
  });

  it("returns null for unknown slugs and invalid ids", async () => {
    expect(await readReportFile("nope")).toBeNull();
    expect(await readReportFile("Bad Slug!")).toBeNull();
    expect(await readReportFile("loop-review", "../etc")).toBeNull();
  });
});
