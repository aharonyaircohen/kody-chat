import { describe, expect, it } from "vitest";

import { authTrustedOrigins } from "../../convex/betterAuth/trustedOrigins";

describe("authTrustedOrigins", () => {
  it("accepts the primary site and additional dashboard aliases", () => {
    expect(
      authTrustedOrigins({
        SITE_URL: "https://dashboard.example.com",
        KODY_AUTH_TRUSTED_ORIGINS:
          " https://dashboard-alias.example.com,https://preview.example.com ",
      }),
    ).toEqual([
      "https://dashboard.example.com",
      "https://dashboard-alias.example.com",
      "https://preview.example.com",
    ]);
  });
});
