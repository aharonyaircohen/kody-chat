import { describe, expect, it } from "vitest";

import {
  isEmailAllowed,
  normalizeClientBrandAuth,
} from "@dashboard/lib/client-auth/allowlist";

describe("normalizeClientBrandAuth", () => {
  it("returns undefined for non-objects", () => {
    expect(normalizeClientBrandAuth(undefined)).toBeUndefined();
    expect(normalizeClientBrandAuth("yes")).toBeUndefined();
    expect(normalizeClientBrandAuth(null)).toBeUndefined();
  });

  it("normalizes emails/domains to lowercase and drops junk", () => {
    const auth = normalizeClientBrandAuth({
      required: true,
      allowedEmails: [" Foo@Acme.COM ", "not-an-email", ""],
      allowedDomains: ["@Acme.com", " "],
    });
    expect(auth).toEqual({
      required: true,
      allowedEmails: ["foo@acme.com"],
      allowedDomains: ["acme.com"],
    });
  });

  it("treats non-true required as false", () => {
    expect(normalizeClientBrandAuth({ required: "yes" })?.required).toBe(false);
  });
});

describe("isEmailAllowed", () => {
  it("rejects missing or malformed emails", () => {
    expect(isEmailAllowed({ required: true }, null)).toBe(false);
    expect(isEmailAllowed({ required: true }, "nope")).toBe(false);
  });

  it("allows any signed-in email when no allowlists configured", () => {
    expect(isEmailAllowed({ required: true }, "a@b.com")).toBe(true);
  });

  it("matches exact emails case-insensitively", () => {
    const auth = { required: true, allowedEmails: ["foo@acme.com"] };
    expect(isEmailAllowed(auth, "FOO@Acme.com")).toBe(true);
    expect(isEmailAllowed(auth, "bar@acme.org")).toBe(false);
  });

  it("matches allowed domains", () => {
    const auth = { required: true, allowedDomains: ["acme.com"] };
    expect(isEmailAllowed(auth, "anyone@acme.com")).toBe(true);
    expect(isEmailAllowed(auth, "anyone@evil-acme.com")).toBe(false);
  });

  it("email allowlist and domain allowlist are OR'd", () => {
    const auth = {
      required: true,
      allowedEmails: ["guest@other.org"],
      allowedDomains: ["acme.com"],
    };
    expect(isEmailAllowed(auth, "guest@other.org")).toBe(true);
    expect(isEmailAllowed(auth, "dev@acme.com")).toBe(true);
    expect(isEmailAllowed(auth, "dev@other.org")).toBe(false);
  });
});
