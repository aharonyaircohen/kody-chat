/**
 * @fileType data
 * @domain wizards
 * @pattern wizard-registry
 * @ai-summary Registry of available setup wizards. The /setup index lists
 *   these; each runs on its own page at /setup/<slug>.
 *
 *   Definitions stay product-owned until a backend-backed editor is needed.
 *   `check` steps may only reference server probes by checkId from the
 *   registry in app/api/kody/wizards/check/route.ts.
 */
export interface WizardRegistryEntry {
  slug: string;
  title: string;
  description: string;
}

export const WIZARD_REGISTRY: readonly WizardRegistryEntry[] = [];

export function getWizardEntry(slug: string): WizardRegistryEntry | null {
  return WIZARD_REGISTRY.find((entry) => entry.slug === slug) ?? null;
}
