import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import type { NextRequest } from "next/server";
import type { Octokit } from "@octokit/rest";

import { getCmsActorRole } from "@dashboard/lib/cms/roles";
import {
  createCmsDocument,
  deleteCmsDocument,
  getCmsDocument,
  listCmsCollections,
  listCmsDocuments,
  updateCmsDocument,
} from "@dashboard/lib/cms/service";
import { generateCmsMcpTools, resolveCmsMcpTool } from "@dashboard/lib/cms/mcp";
import type {
  CmsConfigState,
  CmsDocument,
  CmsListQuery,
  CmsSortEntry,
} from "@dashboard/lib/cms/types";

interface Ctx {
  req: NextRequest;
  octokit: Octokit;
  owner: string;
  repo: string;
}

export async function createCmsTools({
  req,
  octokit,
  owner,
  repo,
}: Ctx): Promise<ToolSet> {
  const actorRole = await getCmsActorRole(req, octokit, owner, repo);
  const cms = await listCmsCollections(octokit, owner, repo, actorRole);
  if (cms.configured === false) return {};

  const result: ToolSet = {};
  for (const definition of generateCmsMcpTools(cms)) {
    result[definition.name] = dynamicTool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: async (args) =>
        executeCmsTool({
          req,
          octokit,
          owner,
          repo,
          cms,
          name: definition.name,
          args: args as Record<string, unknown>,
        }),
    });
  }
  return result;
}

async function executeCmsTool({
  req,
  octokit,
  owner,
  repo,
  cms,
  name,
  args,
}: Ctx & {
  cms: Extract<CmsConfigState, { configured: true }>;
  name: string;
  args: Record<string, unknown>;
}): Promise<unknown> {
  const ref = resolveCmsMcpTool(cms, name);
  if (!ref) return { error: `unknown CMS tool: ${name}` };

  if (name === "cms_list_collections") {
    return {
      collections: cms.collections.map((collection) => ({
        name: collection.name,
        label: collection.label,
        operations: collection.operations,
      })),
    };
  }

  if (ref.action === "list") {
    return listCmsDocuments(req, octokit, owner, repo, ref.collection, {
      filters: filtersValue(args.filters),
      search:
        typeof args.q === "string" && args.q.trim()
          ? { query: args.q.trim() }
          : undefined,
      sort: sortValue(args.sort),
      limit: numberValue(args.limit),
      offset: numberValue(args.offset),
    });
  }

  if (ref.action === "get") {
    return {
      document: await getCmsDocument(
        req,
        octokit,
        owner,
        repo,
        ref.collection,
        requiredString(args.id, "id"),
      ),
    };
  }

  if (ref.action === "create") {
    return {
      document: await createCmsDocument(
        req,
        octokit,
        owner,
        repo,
        ref.collection,
        documentValue(args.data),
      ),
    };
  }

  if (ref.action === "update") {
    return {
      document: await updateCmsDocument(
        req,
        octokit,
        owner,
        repo,
        ref.collection,
        requiredString(args.id, "id"),
        documentValue(args.data),
      ),
    };
  }

  return {
    deleted: await deleteCmsDocument(
      req,
      octokit,
      owner,
      repo,
      ref.collection,
      requiredString(args.id, "id"),
    ),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${field} is required`);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function filtersValue(value: unknown): CmsListQuery["filters"] {
  return objectValue(value) as CmsListQuery["filters"];
}

function documentValue(value: unknown): CmsDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("data must be an object");
  }
  return value as CmsDocument;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sortValue(value: unknown): CmsSortEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const field = (entry as Record<string, unknown>).field;
    if (typeof field !== "string" || !field.trim()) return [];
    return [
      {
        field: field.trim(),
        direction:
          (entry as Record<string, unknown>).direction === "asc"
            ? "asc"
            : "desc",
      } satisfies CmsSortEntry,
    ];
  });
}
