import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRepoReadAccess } from "@kody-ade/base/auth";
import { createServerTtlCache } from "@kody-ade/base/server-ttl-cache";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  InvalidKnowledgeGraphError,
  KNOWLEDGE_DOMAINS,
  parseKnowledgeGraph,
  queryRepositoryKnowledge,
  type KnowledgeGraph,
  type KnowledgeGraphReader,
} from "@kody-ade/knowledge";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    overview: z.boolean().optional(),
    entityId: z.string().trim().min(1).max(500).optional(),
    domain: z.enum(KNOWLEDGE_DOMAINS).optional(),
    search: z.string().trim().max(500).optional(),
    depth: z.number().int().min(0).max(3).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.overview || value.entityId || value.domain || value.search),
    "A knowledge query is required",
  );

function tenantIdFor(access: { auth: { owner: string; repo: string } }) {
  return `${access.auth.owner}/${access.auth.repo}`;
}

class KnowledgeReadError extends Error {
  constructor(
    public readonly code: "knowledge_unavailable" | "graph_unavailable",
    public readonly status: 404 | 502,
  ) {
    super(code);
  }
}

const graphCache = createServerTtlCache<KnowledgeGraph>({
  ttlMs: 30_000,
  maxEntries: 50,
});

const publishedKnowledgeReader: KnowledgeGraphReader = {
  async read(tenantId) {
    const bundle = await createBackendClient().query(api.knowledgeGraphs.get, {
      tenantId,
    });
    if (!bundle?.graphUrl) {
      throw new KnowledgeReadError("knowledge_unavailable", 404);
    }
    return graphCache.get(bundle.graphUrl, async () => {
      const response = await fetch(bundle.graphUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new KnowledgeReadError("graph_unavailable", 502);
      }
      return parseKnowledgeGraph(await response.json());
    });
  },
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = await verifyRepoReadAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  try {
    const result = await queryRepositoryKnowledge(
      publishedKnowledgeReader,
      tenantIdFor(access),
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeReadError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      );
    }
    if (error instanceof InvalidKnowledgeGraphError) {
      return NextResponse.json(
        { error: "invalid_graph", issues: error.issues.slice(0, 20) },
        { status: 502 },
      );
    }
    console.error("[knowledge-system] query failed", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
