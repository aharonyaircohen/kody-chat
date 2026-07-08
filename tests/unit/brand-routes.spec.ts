import { describe, expect, it } from "vitest";

import {
  getBrandBySlug,
  isReservedBrandSlug,
  listBrandConfigs,
} from "@dashboard/lib/brand/config";
import {
  classifyRootSegment,
} from "@dashboard/lib/brand/routes";
import { repoScopedHref } from "@dashboard/lib/routes";

describe("brand routing", () => {
  it("ships demo-brand as the first client tenant", () => {
    const brand = getBrandBySlug("demo-brand");

    expect(brand?.slug).toBe("demo-brand");
    expect(brand?.displayName).toBe("Demo Brand");
    expect(listBrandConfigs()).toHaveLength(1);
  });

  it("keeps numeric root segments owned by task pages", () => {
    expect(classifyRootSegment("123")).toEqual({
      kind: "task",
      issueNumber: 123,
    });
  });

  it("keeps reserved root segments out of brand routing", () => {
    expect(isReservedBrandSlug("chat")).toBe(true);
    expect(classifyRootSegment("chat")).toEqual({
      kind: "reserved",
      slug: "chat",
    });
  });

  it("routes known non-numeric slugs to brand client chat", () => {
    expect(classifyRootSegment("demo-brand")).toEqual({
      kind: "brand",
      brand: getBrandBySlug("demo-brand"),
    });
  });

  it("keeps operator chat repo-scoped instead of treating /chat as standalone", () => {
    expect(repoScopedHref({ owner: "brand-name", repo: "app" }, "/chat")).toBe(
      "/repo/brand-name/app/chat",
    );
  });
});
