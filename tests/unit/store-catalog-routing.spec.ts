import { describe, expect, it } from "vitest";

import {
  storeCatalogPathWithViewState,
  type StoreCatalogViewState,
} from "../../src/dashboard/lib/components/StoreCatalogManager";

describe("store catalog routing", () => {
  it("preserves non-default filter and search state in item links", () => {
    const state: StoreCatalogViewState = {
      kind: "workflow",
      search: "bug flow",
    };

    expect(
      storeCatalogPathWithViewState("/store-catalog/capability/bug", state),
    ).toBe("/store-catalog/capability/bug?filter=workflow&q=bug+flow");
  });

  it("omits query params for the default catalog view", () => {
    expect(
      storeCatalogPathWithViewState("/store-catalog/agent/kody", {
        kind: "all",
        search: " ",
      }),
    ).toBe("/store-catalog/agent/kody");
  });
});
