import type {
  AgentHandoff,
  ChatMessage,
  SessionMeta,
} from "../../../chat-types";
import { isRenderedViewDirective } from "../../../chat-ui-actions";

type StoredMessage = {
  kind: "message";
  role: "user" | "assistant";
  content: string;
  view?: unknown;
  status: "pending" | "committed" | "failed" | "cancelled";
  turnId?: string;
  attachmentIds?: string[];
  createdAt: string;
};

type StoredHandoff = {
  kind: "agent-handoff";
  from: { slug: string; title: string };
  to: { slug: string; title: string };
  createdAt: string;
};

export type ConversationDetail = {
  conversation: {
    conversationId: string;
    title: string;
    preview?: string;
    pinned: boolean;
    activeAgent: { slug: string; title: string };
    runtime: { kind: string; [key: string]: unknown };
    createdAt: string;
    updatedAt: string;
  };
  entries: Array<{
    entryId: string;
    seq: number;
    entry: StoredMessage | StoredHandoff;
  }>;
  checkpoints: Array<{
    version: number;
    throughSeq: number;
    agentEpochId: string;
    summary: string;
    sourceHash: string;
    createdAt: string;
  }>;
  attachments?: Array<{
    attachment: {
      attachmentId: string;
      fileName: string;
      mediaType: string;
      sizeBytes: number;
    };
  }>;
};

function agentKeyForRuntime(
  runtime: ConversationDetail["conversation"]["runtime"],
): string {
  switch (runtime.kind) {
    case "brain":
      return String(runtime.brainId);
    case "engine":
    case "live":
      return String(runtime.profileId);
    default:
      return String(runtime.modelId);
  }
}

export function mapConversationDetail(detail: ConversationDetail): {
  session: SessionMeta;
  messages: ChatMessage[];
} {
  const ordered = [...detail.entries].sort((a, b) => a.seq - b.seq);
  const handoffs: AgentHandoff[] = ordered.flatMap((stored) =>
    stored.entry.kind === "agent-handoff"
      ? [
          {
            id: stored.entryId,
            fromSlug: stored.entry.from.slug,
            fromTitle: stored.entry.from.title,
            toSlug: stored.entry.to.slug,
            toTitle: stored.entry.to.title,
            switchedAt: stored.entry.createdAt,
          },
        ]
      : [],
  );
  const messages: ChatMessage[] = ordered.flatMap((stored) =>
    stored.entry.kind === "message"
      ? [
          {
            id: stored.entryId,
            turnId: stored.entry.turnId,
            role: stored.entry.role,
            text: stored.entry.content,
            view: isRenderedViewDirective(stored.entry.view)
              ? stored.entry.view
              : undefined,
            timestamp: stored.entry.createdAt,
            isLoading: stored.entry.status === "pending",
            attachments: stored.entry.attachmentIds?.flatMap((id) => {
              const metadata = detail.attachments?.find(
                (item) => item.attachment.attachmentId === id,
              )?.attachment;
              return metadata
                ? [
                    {
                      id: `${detail.conversation.conversationId}::${id}`,
                      name: metadata.fileName,
                      mimeType: metadata.mediaType,
                      size: metadata.sizeBytes,
                    },
                  ]
                : [];
            }),
          },
        ]
      : [],
  );
  const checkpoint = [...detail.checkpoints]
    .sort((a, b) => b.version - a.version)
    .at(0);
  return {
    session: {
      id: detail.conversation.conversationId,
      title: detail.conversation.title,
      preview: detail.conversation.preview,
      createdAt: detail.conversation.createdAt,
      updatedAt: detail.conversation.updatedAt,
      messageCount: messages.length,
      pinned: detail.conversation.pinned,
      agentKey: agentKeyForRuntime(detail.conversation.runtime),
      agencyAgent: detail.conversation.activeAgent,
      agentHandoffs: handoffs,
      contextCheckpoint: checkpoint
        ? {
            revision: checkpoint.version,
            version: 1,
            throughMessageCount: checkpoint.throughSeq + 1,
            summary: checkpoint.summary,
            sourceFingerprint: checkpoint.sourceHash,
            createdAt: checkpoint.createdAt,
          }
        : undefined,
    },
    messages,
  };
}

export type MessagePersistenceChange =
  | { kind: "append"; message: ChatMessage }
  | { kind: "update"; message: ChatMessage };

export function reconcileConversationMessages(
  previous: readonly ChatMessage[],
  next: readonly ChatMessage[],
): MessagePersistenceChange[] {
  const previousById = new Map(
    previous.flatMap((message) => (message.id ? [[message.id, message]] : [])),
  );
  const changes: MessagePersistenceChange[] = [];
  for (const message of next) {
    if (!message.id) continue;
    const stored = previousById.get(message.id);
    if (!stored) {
      changes.push({ kind: "append", message });
      continue;
    }
    if (
      stored.text !== message.text ||
      stored.isLoading !== message.isLoading ||
      stored.view !== message.view
    ) {
      changes.push({ kind: "update", message });
    }
  }
  return changes;
}

export function ensureMessageIds(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  return messages.map((message) =>
    message.id ? message : { ...message, id: crypto.randomUUID() },
  );
}
