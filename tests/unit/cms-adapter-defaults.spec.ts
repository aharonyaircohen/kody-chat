import { describe, expect, it, vi } from "vitest";

const companyStore = vi.hoisted(() => ({
  buildCompanyStoreBlobUrl: vi.fn(
    (path: string) => `https://github.com/acme/kody-store/blob/stable/${path}`,
  ),
  listCompanyStoreDirectorySafe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@dashboard/lib/company-store/assets", () => companyStore);

import {
  defaultCmsAdapterSettings,
  listStoreCmsAdapters,
} from "@dashboard/lib/cms/adapter-catalog";

describe("CMS adapter defaults", () => {
  it("provides the file adapter root directory", () => {
    expect(defaultCmsAdapterSettings("file")).toEqual({
      rootDir: "cms/content",
    });
  });

  it("labels the file adapter as kody-state JSON", async () => {
    companyStore.listCompanyStoreDirectorySafe.mockResolvedValue([
      { name: "file", type: "dir" },
    ]);

    await expect(listStoreCmsAdapters({} as never)).resolves.toEqual([
      {
        name: "file",
        label: "kody-state JSON",
        description: "JSON documents in kody-state",
        supportsSchemaGeneration: false,
        htmlUrl:
          "https://github.com/acme/kody-store/blob/stable/cms/adapters/file/index.mjs",
      },
    ]);
  });
});
