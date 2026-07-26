import {
  canPerformMemoryAction,
  createMemory,
  createMemoryRevision,
  reviseMemory,
  type EvidenceRef,
  type Memory,
  type MemoryAction,
  type MemoryContent,
  type MemoryKind,
  type MemoryPrincipal,
  type MemoryRevision,
  type MemoryScope,
} from "./domain";

export interface MemoryStore {
  create(
    memory: Readonly<Memory>,
    revision: Readonly<MemoryRevision>,
  ): Promise<void>;
  get(id: string): Promise<Readonly<Memory> | null>;
  list(scopes: readonly MemoryScope[]): Promise<readonly Readonly<Memory>[]>;
  listRevisions(memoryId: string): Promise<readonly Readonly<MemoryRevision>[]>;
  search(
    scopes: readonly MemoryScope[],
    query: string,
    limit: number,
  ): Promise<readonly Readonly<Memory>[]>;
  revise(
    memory: Readonly<Memory>,
    revision: Readonly<MemoryRevision>,
  ): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export class MemoryAccessDeniedError extends Error {
  constructor() {
    super("Memory access denied");
    this.name = "MemoryAccessDeniedError";
  }
}

export class MemoryNotFoundError extends Error {
  constructor() {
    super("Memory not found");
    this.name = "MemoryNotFoundError";
  }
}

interface MemoryApplicationDependencies {
  readonly store: MemoryStore;
  readonly nextId: () => string;
  readonly now: () => string;
}

interface RememberCommand {
  readonly principal: Readonly<MemoryPrincipal>;
  readonly scope: MemoryScope;
  readonly kind: MemoryKind;
  readonly content: Readonly<MemoryContent>;
  readonly evidence: readonly Readonly<EvidenceRef>[];
  readonly reason: string;
  readonly expiresAt?: string;
}

interface CorrectCommand {
  readonly principal: Readonly<MemoryPrincipal>;
  readonly memoryId: string;
  readonly kind: MemoryKind;
  readonly content: Readonly<MemoryContent>;
  readonly evidence: readonly Readonly<EvidenceRef>[];
  readonly reason: string;
}

interface ForgetCommand {
  readonly principal: Readonly<MemoryPrincipal>;
  readonly memoryId: string;
}

interface ListCommand {
  readonly principal: Readonly<MemoryPrincipal>;
  readonly scopes: readonly MemoryScope[];
}

interface GetCommand {
  readonly principal: Readonly<MemoryPrincipal>;
  readonly memoryId: string;
}

interface SearchCommand extends ListCommand {
  readonly query: string;
  readonly limit: number;
}

function requireAccessibleScopes(
  principal: Readonly<MemoryPrincipal>,
  scopes: readonly MemoryScope[],
): void {
  if (
    scopes.some((scope) => !canPerformMemoryAction(principal, scope, "read"))
  ) {
    throw new MemoryAccessDeniedError();
  }
}

async function findAccessibleMemory(
  store: MemoryStore,
  principal: Readonly<MemoryPrincipal>,
  memoryId: string,
  action: MemoryAction,
): Promise<Readonly<Memory>> {
  const memory = await store.get(memoryId);
  if (!memory) {
    throw new MemoryNotFoundError();
  }
  if (!canPerformMemoryAction(principal, memory.scope, action)) {
    if (!canPerformMemoryAction(principal, memory.scope, "read")) {
      throw new MemoryNotFoundError();
    }
    throw new MemoryAccessDeniedError();
  }
  return memory;
}

export function createMemoryApplication({
  store,
  nextId,
  now,
}: MemoryApplicationDependencies) {
  return Object.freeze({
    async get(command: GetCommand): Promise<Readonly<Memory>> {
      return await findAccessibleMemory(
        store,
        command.principal,
        command.memoryId,
        "read",
      );
    },

    async history(
      command: GetCommand,
    ): Promise<readonly Readonly<MemoryRevision>[]> {
      await findAccessibleMemory(
        store,
        command.principal,
        command.memoryId,
        "read",
      );
      return await store.listRevisions(command.memoryId);
    },

    async remember(command: RememberCommand): Promise<Readonly<Memory>> {
      if (!canPerformMemoryAction(command.principal, command.scope, "write")) {
        throw new MemoryAccessDeniedError();
      }
      const memoryId = nextId();
      const revisionId = nextId();
      const createdAt = now();
      const revision = createMemoryRevision({
        id: revisionId,
        memoryId,
        previousRevisionId: null,
        kind: command.kind,
        content: command.content,
        evidence: command.evidence,
        reason: command.reason,
        actor: command.principal.actor,
        createdAt,
      });
      const memory = createMemory({
        id: memoryId,
        scope: command.scope,
        kind: command.kind,
        content: command.content,
        currentRevisionId: revisionId,
        status: "active",
        createdAt,
        updatedAt: createdAt,
        ...(command.expiresAt === undefined
          ? {}
          : { expiresAt: command.expiresAt }),
      });
      await store.create(memory, revision);
      return memory;
    },

    async correct(command: CorrectCommand): Promise<Readonly<Memory>> {
      const current = await findAccessibleMemory(
        store,
        command.principal,
        command.memoryId,
        "write",
      );
      const result = reviseMemory(current, {
        revisionId: nextId(),
        kind: command.kind,
        content: command.content,
        evidence: command.evidence,
        reason: command.reason,
        actor: command.principal.actor,
        createdAt: now(),
      });
      await store.revise(result.memory, result.revision);
      return result.memory;
    },

    async forget(command: ForgetCommand): Promise<Readonly<{ deleted: true }>> {
      await findAccessibleMemory(
        store,
        command.principal,
        command.memoryId,
        "delete",
      );
      const deleted = await store.remove(command.memoryId);
      if (!deleted) throw new MemoryNotFoundError();
      return Object.freeze({ deleted: true });
    },

    async list(command: ListCommand): Promise<readonly Readonly<Memory>[]> {
      requireAccessibleScopes(command.principal, command.scopes);
      return store.list(command.scopes);
    },

    async search(command: SearchCommand): Promise<readonly Readonly<Memory>[]> {
      requireAccessibleScopes(command.principal, command.scopes);
      const query = command.query.trim();
      if (!query) throw new Error("Memory search query is required");
      if (
        !Number.isInteger(command.limit) ||
        command.limit < 1 ||
        command.limit > 20
      ) {
        throw new Error("Memory search limit must be between 1 and 20");
      }
      return store.search(command.scopes, query, command.limit);
    },
  });
}
