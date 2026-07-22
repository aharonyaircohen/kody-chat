export type ConversationCommand =
  | {
      kind: "append-message";
      actorLogin: string;
      entryId: string;
      idempotencyKey: string;
      role: "user" | "assistant";
      agent?: { slug: string; title: string };
      content: string;
      status: MessageStatus;
      turnId: string;
      attachmentIds?: string[];
      createdAt: string;
    }
  | {
      kind: "update-message";
      actorLogin: string;
      entryId: string;
      content: string;
      status: MessageStatus;
      updatedAt: string;
    }
  | {
      kind: "set-agent";
      actorLogin: string;
      agent: AgentIdentity;
      updatedAt: string;
    }
  | {
      kind: "handoff";
      actorLogin: string;
      entryId: string;
      idempotencyKey: string;
      from: AgentIdentity;
      to: AgentIdentity;
      createdAt: string;
    }
  | {
      kind: "runtime";
      actorLogin: string;
      runtime: ConversationRuntime;
      updatedAt: string;
    }
  | {
      kind: "checkpoint";
      actorLogin: string;
      version: number;
      throughSeq: number;
      agentEpochId: string;
      summary: string;
      sourceHash: string;
      createdAt: string;
    }
  | { kind: "clear"; actorLogin: string };

type MessageStatus = "pending" | "committed" | "failed" | "cancelled";
type AgentIdentity = { slug: string; title: string };
export type ConversationRuntime =
  | { kind: "direct"; modelId: string }
  | { kind: "brain"; brainId: string }
  | { kind: "engine"; profileId: string }
  | { kind: "live"; profileId: string };

type ConversationListResponse = {
  conversations: Array<Record<string, unknown> & { conversationId: string }>;
};

const browserFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, init);

export class ConversationClient {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly fetcher: typeof fetch = browserFetch,
    private readonly headers: () => Record<string, string> = () => ({}),
  ) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...this.headers(),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Conversation request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  async list(
    surface: "global" | "vibe-default" = "global",
  ): Promise<ConversationListResponse["conversations"]> {
    const result = await this.request<ConversationListResponse>(
      `/api/kody/chat/conversations?surface=${surface}`,
    );
    return result.conversations;
  }

  async get(conversationId: string): Promise<Record<string, unknown>> {
    return await this.request(
      `/api/kody/chat/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  create(
    input: Record<string, unknown> & { conversationId: string },
  ): Promise<void> {
    return this.enqueue(input.conversationId, async () => {
      await this.request("/api/kody/chat/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      });
    });
  }

  command(conversationId: string, command: ConversationCommand): Promise<void> {
    return this.enqueue(conversationId, async () => {
      await this.request(
        `/api/kody/chat/conversations/${encodeURIComponent(conversationId)}/commands`,
        { method: "POST", body: JSON.stringify(command) },
      );
    });
  }

  private enqueue(
    conversationId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const previous = this.queues.get(conversationId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(conversationId, next);
    void next.finally(() => {
      if (this.queues.get(conversationId) === next) {
        this.queues.delete(conversationId);
      }
    });
    return next;
  }

  async updateMetadata(
    conversationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.request(
      `/api/kody/chat/conversations/${encodeURIComponent(conversationId)}`,
      { method: "PATCH", body: JSON.stringify(metadata) },
    );
  }

  async remove(conversationId: string): Promise<void> {
    await this.request(
      `/api/kody/chat/conversations/${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    );
  }
}

export const conversationClient = new ConversationClient();

export function createConversationClient(
  headers: Record<string, string>,
  fetcher: typeof fetch = browserFetch,
): ConversationClient {
  return new ConversationClient(fetcher, () => headers);
}
