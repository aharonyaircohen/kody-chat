import { describe, expect, it, vi } from "vitest";

import {
  ensureViewsOwnedCapabilityAction,
  isViewsPath,
} from "../../src/dashboard/lib/picker/views-owned-preview-action";
import type { PreviewAction } from "../../src/dashboard/lib/picker/protocol";

const capabilityAction: PreviewAction = {
  op: "navigate",
  url: "https://www.facebook.com/",
  capabilitySlug: "draft-facebook-personal-post",
  allowedOrigins: ["https://www.facebook.com"],
};

describe("Views-owned Capability browser actions", () => {
  it("recognizes canonical repository-scoped Views routes", () => {
    expect(isViewsPath("/repo/acme/project/preview")).toBe(true);
    expect(isViewsPath("/repo/acme/project/preview/facebook")).toBe(true);
    expect(isViewsPath("/repo/acme/project/file-spaces/content-studio")).toBe(
      false,
    );
  });

  it("opens Views and waits for its remote browser before acting", async () => {
    let available = false;
    const openViews = vi.fn(() => {
      available = true;
    });

    await expect(
      ensureViewsOwnedCapabilityAction({
        action: capabilityAction,
        pathname: "/repo/acme/project/file-spaces/content-studio/post.md",
        openViews,
        remoteBrowserAvailable: () => available,
        wait: async () => {},
      }),
    ).resolves.toBe(true);

    expect(openViews).toHaveBeenCalledOnce();
  });

  it("never sends a Capability action to the preview extension fallback", async () => {
    const openViews = vi.fn();

    await expect(
      ensureViewsOwnedCapabilityAction({
        action: capabilityAction,
        pathname: "/repo/acme/project/preview/facebook",
        openViews,
        remoteBrowserAvailable: () => false,
        wait: async () => {},
        maxAttempts: 2,
      }),
    ).resolves.toBe(false);

    expect(openViews).not.toHaveBeenCalled();
  });

  it("leaves ordinary preview actions on their existing surface", async () => {
    const openViews = vi.fn();

    await expect(
      ensureViewsOwnedCapabilityAction({
        action: { op: "click", selector: "#save" },
        pathname: "/repo/acme/project/tasks/1/preview",
        openViews,
        remoteBrowserAvailable: () => false,
        wait: async () => {},
      }),
    ).resolves.toBe(true);

    expect(openViews).not.toHaveBeenCalled();
  });
});
