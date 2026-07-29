import type { NextRequest } from "next/server";
import { tool } from "ai";
import { z } from "zod";

const domainSchema = z.enum([
  "company",
  "business",
  "data",
  "technology",
  "work",
  "agency",
]);

const querySchema = z
  .object({
    entityId: z.string().trim().min(1).max(500).optional(),
    domain: domainSchema.optional(),
    search: z.string().trim().min(1).max(500).optional(),
    depth: z.number().int().min(0).max(3).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .refine(
    (value) => Boolean(value.entityId || value.domain || value.search),
    "Provide an entityId, domain, or search query",
  );

const FORWARDED_HEADERS = [
  "authorization",
  "cookie",
  "x-kody-token",
  "x-kody-owner",
  "x-kody-repo",
] as const;

export function createKnowledgeSystemTools(opts: {
  req: NextRequest;
  owner: string;
  repo: string;
}) {
  return {
    query_knowledge_system: tool({
      description:
        `Query the published Knowledge System for ${opts.owner}/${opts.repo}. ` +
        "Use this before answering questions that depend on how the company, " +
        "business, data, technology, work, or agency fit together. Search by " +
        "the user's subject first. Omit domain unless the user explicitly asks to restrict " +
        "the search to one domain. Then expand a returned entity when more " +
        "context is needed. Results include connected context and source " +
        "provenance; do not claim unsupported facts.",
      inputSchema: querySchema,
      execute: async (query) => {
        const headers = new Headers({ "content-type": "application/json" });
        for (const name of FORWARDED_HEADERS) {
          const value = opts.req.headers.get(name);
          if (value) headers.set(name, value);
        }

        try {
          const response = await fetch(
            `${opts.req.nextUrl.origin}/api/kody/knowledge-system/query`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(query),
              cache: "no-store",
            },
          );
          const payload = (await response.json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          if (!response.ok) {
            return {
              error:
                typeof payload?.error === "string"
                  ? payload.error
                  : "knowledge_query_failed",
              status: response.status,
            };
          }
          if (
            payload?.context &&
            typeof payload.context === "object" &&
            !Array.isArray(payload.context)
          ) {
            return payload.context;
          }
          return payload ?? { error: "invalid_knowledge_response" };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "knowledge_query_failed",
          };
        }
      },
    }),
  };
}
