/**
 * @fileType data
 * @domain wizards
 * @pattern wizard-definition
 * @ai-summary First wizard consumer: guided setup for client-surface
 *   sign-in. Built per provider from the client-auth catalog — instructions
 *   (create the OAuth app, exact callback URL), collect the client ID
 *   (variable), the secret (vault), any catalog extras (issuer …), then a
 *   server check that the provider's credentials actually resolve.
 */
import {
  PROVIDER_CATALOG,
  credentialNames,
  providerLabel,
} from "../client-auth/catalog";
import {
  validateWizardDefinition,
  type WizardDefinition,
  type WizardStep,
} from "./types";

export const CLIENT_SIGNIN_WIZARD_SLUG = "client-signin";
export const CLIENT_SIGNIN_CHECK_ID = "client-signin-credentials";

export function clientSigninWizard(
  provider: string,
  origin: string,
): WizardDefinition | null {
  if (!(provider in PROVIDER_CATALOG)) return null;
  const label = providerLabel(provider);
  const names = credentialNames(provider);
  const extras = PROVIDER_CATALOG[provider]?.extra ?? {};

  const steps: WizardStep[] = [
    {
      type: "instructions",
      id: "create-app",
      title: `Create a ${label} OAuth app`,
      body: [
        `In your ${label} developer console, create an OAuth application for this dashboard.`,
        ``,
        `Set the authorized redirect / callback URL to exactly:`,
        ``,
        `${origin}/api/auth/callback/${provider}`,
        ``,
        `When it's created, keep the client ID and client secret handy for the next steps.`,
      ].join("\n"),
    },
    {
      type: "collect-variable",
      id: "client-id",
      title: `${label} client ID`,
      name: names.id,
      hint: "Public identifier of the OAuth app — stored on the Variables page.",
      placeholder: "e.g. 1234-abcd.apps.example.com",
    },
    {
      type: "collect-secret",
      id: "client-secret",
      title: `${label} client secret`,
      name: names.secret,
      hint: "Stored encrypted in the Secrets vault.",
    },
    ...Object.entries(extras).map(
      ([option, variable]): WizardStep => ({
        type: "collect-variable",
        id: `extra-${option}`,
        title: `${label} ${option}`,
        name: variable,
        hint: `Required ${option} for ${label} — stored on the Variables page.`,
      }),
    ),
    {
      type: "check",
      id: "verify",
      title: "Verify configuration",
      checkId: CLIENT_SIGNIN_CHECK_ID,
      params: { provider },
      hint: "Confirms the credentials resolve from Variables and Secrets.",
    },
  ];

  return validateWizardDefinition({
    slug: CLIENT_SIGNIN_WIZARD_SLUG,
    title: `${label} sign-in setup`,
    description: `Enable ${label} sign-in for client brand pages.`,
    steps,
  });
}
