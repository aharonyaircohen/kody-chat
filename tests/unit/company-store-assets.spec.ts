import { describe, expect, it } from "vitest";

import { mergeAssetsBySlug } from "../../src/dashboard/lib/company-store/assets";

describe("company store asset merge", () => {
  it("keeps local assets first and adds store-only assets", () => {
    const merged = mergeAssetsBySlug(
      [
        { slug: "fix", source: "local" },
        { slug: "release", source: "local" },
      ],
      [
        { slug: "release", source: "store" },
        { slug: "sync", source: "store" },
      ],
    );

    expect(merged).toEqual([
      { slug: "fix", source: "local" },
      { slug: "release", source: "local" },
      { slug: "sync", source: "store" },
    ]);
  });
});
