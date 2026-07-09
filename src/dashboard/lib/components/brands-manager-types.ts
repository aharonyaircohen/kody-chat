/**
 * @fileType types
 * @domain client-chat
 * @pattern brands-manager-types
 * @ai-summary Shared data shapes for the client brand admin UI.
 */

export interface BrandRow {
  slug: string;
  name: string;
  accent: string;
  locale?: string;
  welcomeText?: string;
  source: "repo" | "builtin";
  sha: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface BrandsQueryScope {
  owner?: string | null;
  repo?: string | null;
}

export interface SavePayload {
  slug: string;
  name: string;
  accent: string;
  locale?: string;
  welcomeText?: string;
  isUpdate: boolean;
}
