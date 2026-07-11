/**
 * @fileType utility
 * @domain kody
 * @pattern github-client
 * @ai-summary Barrel for the GitHub API client — implementation split into
 * src/dashboard/lib/github/{core,branches,status,issues,workflows,prs,discussions}.
 * Importers keep using "@dashboard/lib/github-client" unchanged.
 */
export * from "@kody-ade/base/github/core";
export * from "./github/branches";
export * from "./github/status";
export * from "@kody-ade/base/github/issues";
export * from "@kody-ade/base/github/workflows";
export * from "./github/prs";
export * from "@kody-ade/base/github/discussions";
