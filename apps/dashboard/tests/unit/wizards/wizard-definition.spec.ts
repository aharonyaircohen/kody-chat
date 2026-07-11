import { describe, expect, it } from "vitest";

import {
  validateWizardDefinition,
  type WizardDefinition,
} from "@dashboard/lib/wizards/types";
import {
  CLIENT_SIGNIN_CHECK_ID,
  clientSigninWizard,
} from "@dashboard/lib/wizards/client-signin";
import { PROVIDER_CATALOG } from "@dashboard/lib/client-auth/catalog";
import { BUILTIN_FEATURES, getBuiltinFeature } from "@dashboard/lib/features/catalog";

const ORIGIN = "https://dash.example.com";

describe("validateWizardDefinition", () => {
  it("rejects duplicate step ids", () => {
    expect(() =>
      validateWizardDefinition({
        slug: "demo",
        title: "Demo",
        description: "d",
        steps: [
          { type: "instructions", id: "a", title: "One", body: "x" },
          { type: "instructions", id: "a", title: "Two", body: "y" },
        ],
      }),
    ).toThrow(/duplicate step ids/);
  });

  it("rejects invalid variable names in collect steps", () => {
    expect(() =>
      validateWizardDefinition({
        slug: "demo",
        title: "Demo",
        description: "d",
        steps: [
          { type: "collect-variable", id: "v", title: "V", name: "lowercase" },
        ],
      }),
    ).toThrow(/Invalid wizard definition/);
  });
});

describe("clientSigninWizard", () => {
  it("returns null for unknown providers", () => {
    expect(clientSigninWizard("bogus", ORIGIN)).toBeNull();
  });

  it("builds instructions + id + secret + check for google", () => {
    const wizard = clientSigninWizard("google", ORIGIN) as WizardDefinition;
    const types = wizard.steps.map((step) => step.type);
    expect(types).toEqual([
      "instructions",
      "collect-variable",
      "collect-secret",
      "check",
    ]);
    const instructions = wizard.steps[0];
    expect(
      instructions.type === "instructions" ? instructions.body : "",
    ).toContain(`${ORIGIN}/api/auth/callback/google`);
    const check = wizard.steps.at(-1);
    expect(check?.type === "check" ? check.checkId : "").toBe(
      CLIENT_SIGNIN_CHECK_ID,
    );
  });

  it("adds extra-option steps where the catalog declares them", () => {
    const wizard = clientSigninWizard("auth0", ORIGIN) as WizardDefinition;
    const names = wizard.steps.flatMap((step) =>
      "name" in step ? [step.name] : [],
    );
    expect(names).toContain("AUTH0_ISSUER");
  });

  it("validates for every catalog provider", () => {
    for (const provider of Object.keys(PROVIDER_CATALOG)) {
      expect(clientSigninWizard(provider, ORIGIN)).not.toBeNull();
    }
  });
});

describe("builtin features", () => {
  it("exposes client-signin with a setup wizard route", () => {
    const feature = getBuiltinFeature("client-signin");
    expect(feature?.setupHref).toBe("/setup/client-signin");
  });

  it("uses valid slugs", () => {
    for (const feature of BUILTIN_FEATURES) {
      expect(feature.slug).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
    }
  });
});
