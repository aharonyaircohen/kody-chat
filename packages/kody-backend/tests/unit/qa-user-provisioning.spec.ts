import { describe, expect, it } from "vitest";

import { emailPasswordOptions } from "../../convex/betterAuth/auth";

describe("QA user provisioning", () => {
  it("keeps public email registration disabled", () => {
    expect(emailPasswordOptions()).toMatchObject({
      enabled: true,
      disableSignUp: true,
    });
  });

  it("allows signup only for the trusted provisioning action", () => {
    expect(emailPasswordOptions({ allowSignUp: true })).toMatchObject({
      enabled: true,
      disableSignUp: false,
    });
  });
});
