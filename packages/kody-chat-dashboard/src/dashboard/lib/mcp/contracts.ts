import { z } from "zod";

export const KODY_MCP_PROTOCOL_VERSION = "2025-11-25";
export const KODY_MCP_CONTRACT_VERSION = "2026-09-03.7";
export const KODY_MCP_SERVER_VERSION = "0.5.0";

export const permissionClassSchema = z.enum([
  "read",
  "write",
  "approval",
  "admin",
]);
export type PermissionClass = z.infer<typeof permissionClassSchema>;

export const kodyMcpScopeSchema = z.object({
  user: z.object({ login: z.string().min(1), githubId: z.number().int() }),
  organization: z.object({ login: z.string().min(1) }),
  repository: z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    tenantId: z.string().regex(/^[^/]+\/[^/]+$/),
  }),
});

export const mcpPrincipalSchema = z.object({
  tokenId: z.string().min(1),
  name: z.string().min(1),
  tenantId: z.string().regex(/^[^/]+\/[^/]+$/),
  actorLogin: z.string().min(1),
  actorGithubId: z.number().int().nonnegative(),
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type McpPrincipal = z.infer<typeof mcpPrincipalSchema>;

export function scopeForPrincipal(principal: McpPrincipal) {
  const [owner, name] = principal.tenantId.split("/", 2);
  return kodyMcpScopeSchema.parse({
    user: { login: principal.actorLogin, githubId: principal.actorGithubId },
    organization: { login: owner },
    repository: { owner, name, tenantId: principal.tenantId },
  });
}

export const sharedWorkRecordSchema = z.object({
  recordId: z.string(),
  repository: z.string(),
  title: z.string(),
  objective: z.string(),
  status: z.enum(["planned", "active", "blocked", "completed", "cancelled"]),
  revision: z.number().int().positive(),
  summary: z.string(),
  goal: z.string().optional(),
  tasks: z.array(z.string()),
  updatedBy: z.object({
    tokenId: z.string(),
    name: z.string(),
    actorLogin: z.string(),
  }),
  decisions: z.array(
    z.object({
      summary: z.string(),
      rationale: z.string().optional(),
      recordedAt: z.string(),
    }),
  ),
  checkpoints: z.array(
    z.object({ summary: z.string(), recordedAt: z.string() }),
  ),
  evidence: z.array(
    z.object({
      kind: z.string(),
      reference: z.string(),
      summary: z.string(),
      recordedAt: z.string(),
    }),
  ),
  artifacts: z.array(
    z.object({
      kind: z.string(),
      reference: z.string(),
      summary: z.string(),
      recordedAt: z.string(),
    }),
  ),
  handoff: z
    .object({
      toAgent: z.string(),
      summary: z.string(),
      nextSteps: z.array(z.string()),
      recordedAt: z.string(),
    })
    .optional(),
  blockers: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input" }) as JsonSchema;
}
