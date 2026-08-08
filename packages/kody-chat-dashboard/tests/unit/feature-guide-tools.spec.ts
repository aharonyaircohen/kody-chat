import { beforeAll, describe, expect, it } from "vitest";

import { getFeatureGuideRegistry } from "../../src/dashboard/lib/chat/platform/server-feature-guides";
import type { FeatureGuide } from "../../src/dashboard/lib/chat/platform/feature-guide-context";
import {
  describeFeatureTool,
  listDashboardFeaturesTool,
} from "../../app/api/kody/chat/tools/feature-tools";

const guide: FeatureGuide = {
  id: "workflows",
  title: "Workflows",
  summary: "Build and run visual capability flows.",
  routes: ["/workflows"],
  aliases: ["workflow", "workflows"],
  body: "# Workflows\n\n## What will not work\n\nUnbounded cycles.",
};

beforeAll(() => {
  const registry = getFeatureGuideRegistry();
  if (!registry.providerIds().includes("feature-guide-tools-test")) {
    registry.register("feature-guide-tools-test", {
      list: async () => [guide],
      read: async (id) => (id === guide.id ? guide : null),
      resolveForTurn: async () => guide,
    });
  }
});

describe("feature guide Agent tools", () => {
  it("lists host guides in the existing Dashboard feature catalog", async () => {
    const result = (await listDashboardFeaturesTool.execute!(
      {},
      {} as never,
    )) as { features: Array<{ id: string; name: string; summary: string }> };

    expect(result.features).toContainEqual(
      expect.objectContaining({ id: "workflows", name: "Workflows" }),
    );
  });

  it("returns the full guide through describe_feature", async () => {
    const result = await describeFeatureTool.execute!(
      { id: "workflows" },
      {} as never,
    );

    expect(result).toMatchObject({
      id: "workflows",
      name: "Workflows",
      details: expect.stringContaining("Unbounded cycles"),
    });
  });
});
