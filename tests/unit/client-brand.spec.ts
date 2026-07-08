import { describe, expect, it } from "vitest";

import {
  getClientBrand,
  normalizeClientBrandSlug,
} from "@dashboard/lib/client-brand";

describe("client brand config", () => {
  it("normalizes route slugs safely", () => {
    expect(normalizeClientBrandSlug("Kody")).toBe("kody");
    expect(normalizeClientBrandSlug(" brand--name ")).toBe("brand-name");
    expect(normalizeClientBrandSlug("bad/../slug")).toBe("bad-slug");
  });

  it("uses Kody as the generic client brand", () => {
    expect(getClientBrand("kody")).toMatchObject({
      slug: "kody",
      name: "Kody",
    });
  });

  it("creates a readable fallback brand name for unknown brands", () => {
    expect(getClientBrand("brand-name")).toMatchObject({
      slug: "brand-name",
      name: "Brand Name",
    });
  });
});
