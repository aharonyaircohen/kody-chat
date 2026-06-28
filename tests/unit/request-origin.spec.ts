import { describe, expect, it } from "vitest";

import { requestOrigin } from "@dashboard/lib/request-origin";

describe("requestOrigin", () => {
  it("prefers a valid Origin header", () => {
    const req = new Request("https://fallback.example.test/api", {
      headers: { origin: "https://dashboard.example.test/some/path" },
    });
    expect(requestOrigin(req)).toBe("https://dashboard.example.test");
  });

  it("uses forwarded proto and host when Origin is absent", () => {
    const req = new Request("http://internal.example.test/api", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "dashboard.example.test",
      },
    });
    expect(requestOrigin(req)).toBe("https://dashboard.example.test");
  });

  it("falls back to the request URL origin", () => {
    const req = new Request("https://fallback.example.test/api");
    expect(requestOrigin(req)).toBe("https://fallback.example.test");
  });
});
