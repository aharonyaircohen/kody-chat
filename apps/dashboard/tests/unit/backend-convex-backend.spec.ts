/**
 * Unit tests for the Convex backend helper
 * (src/dashboard/lib/backend/convex-backend.ts): cached client singleton,
 * missing-CONVEX_URL error, and the tenant-id convention.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  ctor: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    url: string;
    constructor(url: string) {
      convexMock.ctor(url);
      this.url = url;
    }
  },
}));

import {
  _resetConvexClient,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

afterEach(() => {
  delete process.env.CONVEX_URL;
  _resetConvexClient();
});

describe("convex backend helper", () => {
  it("builds the client from CONVEX_URL and caches it", () => {
    const first = getConvexClient();
    const second = getConvexClient();
    expect(first).toBe(second);
    expect(convexMock.ctor).toHaveBeenCalledTimes(1);
    expect(convexMock.ctor).toHaveBeenCalledWith(
      "https://example.convex.cloud",
    );
  });

  it("throws a clear error when CONVEX_URL is unset", () => {
    delete process.env.CONVEX_URL;
    expect(() => getConvexClient()).toThrow(/CONVEX_URL is not configured/);
  });

  it("scopes tenants as owner/repo", () => {
    expect(tenantIdFor("acme", "widgets")).toBe("acme/widgets");
  });
});
