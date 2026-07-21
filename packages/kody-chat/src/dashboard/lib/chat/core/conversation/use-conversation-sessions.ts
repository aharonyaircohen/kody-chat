import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredAuth } from "@dashboard/lib/api";
import type {
  AgencyAgentIdentity,
  ChatMessage,
  SessionMeta,
} from "@dashboard/lib/chat-types";
import type { ConversationCheckpoint } from "../conversation-compaction";
import {
  conversationClient as defaultConversationClient,
  createConversationClient,
  type ConversationCommand,
} from "./conversation-client";
import {
  ensureMessageIds,
  mapConversationDetail,
  reconcileConversationMessages,
  type ConversationDetail,
} from "./conversation-session-store";

export type ChatSessionScope = "global" | "vibe-default";
type MessageUpdater =
  ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[]);

export interface UseConversationSessionsResult {
  hydrated: boolean;
  sessions: SessionMeta[];
  activeSession: SessionMeta | null;
  messages: ChatMessage[];
  persistenceError: string | null;
  persistUserMessage: (
    sessionId: string,
    message: ChatMessage & { id: string; role: "user" },
  ) => Promise<void>;
  setMessages: (messages: MessageUpdater) => void;
  setSessionMessages: (
    sessionId: string,
    messages: MessageUpdater,
    options?: { persist?: boolean },
  ) => void;
  getSessionMessages: (sessionId: string) => ChatMessage[];
  createSession: (opts?: { agentKey?: string }) => string;
  switchSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  deleteSession: (sessionId: string) => void;
  pinSession: (sessionId: string) => void;
  clearActiveSession: () => void;
  setSessionAgent: (sessionId: string, agentKey: string) => void;
  setSessionAgencyAgent: (
    sessionId: string,
    agent: AgencyAgentIdentity,
  ) => void;
  setSessionCheckpoint: (
    sessionId: string,
    checkpoint: ConversationCheckpoint,
  ) => void;
}

function actorLogin(): string | null {
  return getStoredAuth()?.userLogin ?? null;
}

function runtimeForAgentKey(agentKey?: string) {
  if (agentKey === "brain" || agentKey === "brain-fly") {
    return { kind: "brain" as const, brainId: agentKey };
  }
  if (agentKey === "kody-live") {
    return { kind: "live" as const, profileId: agentKey };
  }
  if (agentKey?.startsWith("engine")) {
    return { kind: "engine" as const, profileId: agentKey };
  }
  return { kind: "direct" as const, modelId: agentKey ?? "default" };
}

function storedAttachmentId(id: string): string {
  return id.includes("::") ? id.slice(id.indexOf("::") + 2) : id;
}

export function mergeHydratedSessions(
  loaded: SessionMeta[],
  locallyCreated: SessionMeta[],
): SessionMeta[] {
  const loadedIds = new Set(loaded.map((session) => session.id));
  return [
    ...locallyCreated.filter((session) => !loadedIds.has(session.id)),
    ...loaded,
  ];
}

export function preserveActiveSessionId(
  currentSessionId: string,
  firstLoadedSessionId: string,
): string {
  return currentSessionId || firstLoadedSessionId;
}

function sessionFromList(value: Record<string, unknown>): SessionMeta {
  return {
    id: String(value.conversationId),
    title: String(value.title ?? "New conversation"),
    preview: typeof value.preview === "string" ? value.preview : undefined,
    createdAt: String(value.createdAt),
    updatedAt: String(value.updatedAt),
    messageCount: 0,
    pinned: value.pinned === true,
    agencyAgent:
      value.activeAgent && typeof value.activeAgent === "object"
        ? (value.activeAgent as AgencyAgentIdentity)
        : { slug: "kody", title: "Kody" },
  };
}

export function useConversationSessions(
  scope: ChatSessionScope = "global",
  requestHeaders?: Record<string, string>,
): UseConversationSessionsResult {
  const conversationClient = useMemo(
    () =>
      requestHeaders
        ? createConversationClient(requestHeaders)
        : defaultConversationClient,
    [requestHeaders],
  );
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const sessionsRef = useRef<SessionMeta[]>([]);
  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [activeSessionId, setActiveSessionId] = useState("");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const locallyCreatedSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const persist = useCallback((operation: Promise<unknown>) => {
    void operation.catch((error: unknown) =>
      setPersistenceError(
        error instanceof Error ? error.message : "Conversation save failed",
      ),
    );
  }, []);

  const loadDetail = useCallback(async (conversationId: string) => {
    const detail = (await conversationClient.get(
      conversationId,
    )) as ConversationDetail;
    const mapped = mapConversationDetail(detail);
    setSessions((previous) => [
      ...previous.filter((session) => session.id !== conversationId),
      mapped.session,
    ]);
    setMessagesBySession((previous) => ({
      ...previous,
      [conversationId]: mapped.messages,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    locallyCreatedSessionIdsRef.current = new Set();
    setActiveSessionId("");
    void conversationClient
      .list(scope)
      .then(async (records) => {
        if (cancelled) return;
        const loaded = records.map(sessionFromList);
        setSessions((previous) => {
          const locallyCreated = previous.filter((session) =>
            locallyCreatedSessionIdsRef.current.has(session.id),
          );
          const merged = mergeHydratedSessions(loaded, locallyCreated);
          sessionsRef.current = merged;
          return merged;
        });
        const firstId = loaded[0]?.id ?? "";
        setActiveSessionId((current) =>
          preserveActiveSessionId(current, firstId),
        );
        if (firstId) await loadDetail(firstId);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPersistenceError(
            error instanceof Error ? error.message : "Conversation load failed",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadDetail, scope]);

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }),
    [sessions],
  );
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;
  const messages = activeSessionId
    ? (messagesBySession[activeSessionId] ?? [])
    : [];

  const createSession = useCallback(
    (opts?: { agentKey?: string }) => {
      const id = crypto.randomUUID();
      locallyCreatedSessionIdsRef.current.add(id);
      const now = new Date().toISOString();
      const login = actorLogin();
      const session: SessionMeta = {
        id,
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        pinned: false,
        agentKey: opts?.agentKey,
        agencyAgent: { slug: "kody", title: "Kody" },
      };
      setSessions((previous) => {
        const next = [session, ...previous];
        sessionsRef.current = next;
        return next;
      });
      setMessagesBySession((previous) => ({ ...previous, [id]: [] }));
      setActiveSessionId(id);
      if (login) {
        persist(
          conversationClient.create({
            conversationId: id,
            title: session.title,
            activeAgent: session.agencyAgent,
            runtime: runtimeForAgentKey(opts?.agentKey),
            actorLogin: login,
            surface: scope,
          }),
        );
      }
      return id;
    },
    [persist, scope],
  );

  const persistMessageChanges = useCallback(
    (session: SessionMeta, previous: ChatMessage[], next: ChatMessage[]) => {
      const login = actorLogin();
      if (!login) return;
      for (const change of reconcileConversationMessages(previous, next)) {
        const message = change.message;
        const status = message.isLoading ? "pending" : "committed";
        const command: ConversationCommand =
          change.kind === "append"
            ? {
                kind: "append-message",
                actorLogin: login,
                entryId: message.id!,
                idempotencyKey: message.id!,
                role: message.role,
                ...(message.role === "assistant"
                  ? {
                      agent: message.agent ??
                        session.agencyAgent ?? { slug: "kody", title: "Kody" },
                    }
                  : {}),
                content: message.text,
                status,
                turnId: message.turnId ?? message.id!,
                attachmentIds: message.attachments?.map((item) =>
                  storedAttachmentId(item.id),
                ),
                createdAt: message.timestamp,
              }
            : {
                kind: "update-message",
                actorLogin: login,
                entryId: message.id!,
                content: message.text,
                status,
                updatedAt: new Date().toISOString(),
              };
        persist(conversationClient.command(session.id, command));
      }
    },
    [persist],
  );

  const persistUserMessage = useCallback(
    async (
      sessionId: string,
      message: ChatMessage & { id: string; role: "user" },
    ) => {
      const login = actorLogin();
      if (!login)
        throw new Error("Conversation save requires a signed-in user");
      try {
        await conversationClient.command(sessionId, {
          kind: "append-message",
          actorLogin: login,
          entryId: message.id,
          idempotencyKey: message.id,
          role: "user",
          content: message.text,
          status: "committed",
          turnId: message.id,
          attachmentIds: message.attachments?.map((item) =>
            storedAttachmentId(item.id),
          ),
          createdAt: message.timestamp,
        });
        setPersistenceError(null);
      } catch (error) {
        setPersistenceError(
          error instanceof Error ? error.message : "Conversation save failed",
        );
        throw error;
      }
    },
    [],
  );

  const setSessionMessages = useCallback(
    (
      sessionId: string,
      value: MessageUpdater,
      options?: { persist?: boolean },
    ) => {
      setMessagesBySession((previousBySession) => {
        const previous = previousBySession[sessionId] ?? [];
        const next = ensureMessageIds(
          typeof value === "function" ? value(previous) : value,
        );
        const session = sessionsRef.current.find(
          (item) => item.id === sessionId,
        );
        if (session && options?.persist !== false) {
          persistMessageChanges(session, previous, next);
        }
        setSessions((current) =>
          current.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  messageCount: next.length,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        return { ...previousBySession, [sessionId]: next };
      });
    },
    [persistMessageChanges],
  );

  const setMessages = useCallback(
    (value: MessageUpdater) => {
      if (activeSessionId) setSessionMessages(activeSessionId, value);
    },
    [activeSessionId, setSessionMessages],
  );

  const switchSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      if (!messagesBySession[sessionId]) persist(loadDetail(sessionId));
    },
    [loadDetail, messagesBySession, persist],
  );

  const renameSession = useCallback(
    (sessionId: string, title: string) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId ? { ...session, title } : session,
        ),
      );
      persist(conversationClient.updateMetadata(sessionId, { title }));
    },
    [persist],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((previous) => {
        const remaining = previous.filter(
          (session) => session.id !== sessionId,
        );
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0]?.id ?? "");
        }
        return remaining;
      });
      setMessagesBySession((previous) => {
        const { [sessionId]: _removed, ...remaining } = previous;
        return remaining;
      });
      persist(conversationClient.remove(sessionId));
    },
    [activeSessionId, persist],
  );

  const pinSession = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find((item) => item.id === sessionId);
      if (!session) return;
      const pinned = !session.pinned;
      setSessions((previous) =>
        previous.map((item) =>
          item.id === sessionId ? { ...item, pinned } : item,
        ),
      );
      persist(conversationClient.updateMetadata(sessionId, { pinned }));
    },
    [persist],
  );

  const clearActiveSession = useCallback(() => {
    if (!activeSessionId) return;
    setMessagesBySession((previous) => ({
      ...previous,
      [activeSessionId]: [],
    }));
    const login = actorLogin();
    if (login) {
      persist(
        conversationClient.command(activeSessionId, {
          kind: "clear",
          actorLogin: login,
        }),
      );
    }
  }, [activeSessionId, persist]);

  const setSessionAgent = useCallback(
    (sessionId: string, agentKey: string) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId ? { ...session, agentKey } : session,
        ),
      );
      const login = actorLogin();
      if (login) {
        persist(
          conversationClient.command(sessionId, {
            kind: "runtime",
            actorLogin: login,
            runtime: runtimeForAgentKey(agentKey),
            updatedAt: new Date().toISOString(),
          }),
        );
      }
    },
    [persist],
  );

  const setSessionAgencyAgent = useCallback(
    (sessionId: string, agent: AgencyAgentIdentity) => {
      const session = sessionsRef.current.find((item) => item.id === sessionId);
      if (!session || session.agencyAgent?.slug === agent.slug) return;
      const from = session.agencyAgent ?? { slug: "kody", title: "Kody" };
      const handoffId = crypto.randomUUID();
      const switchedAt = new Date().toISOString();
      setSessions((previous) =>
        previous.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                agencyAgent: agent,
                contextCheckpoint: undefined,
                agentHandoffs:
                  item.messageCount > 0
                    ? [
                        ...(item.agentHandoffs ?? []),
                        {
                          id: handoffId,
                          fromSlug: from.slug,
                          fromTitle: from.title,
                          toSlug: agent.slug,
                          toTitle: agent.title,
                          switchedAt,
                        },
                      ]
                    : item.agentHandoffs,
              }
            : item,
        ),
      );
      const login = actorLogin();
      if (login && session.messageCount > 0) {
        persist(
          conversationClient.command(sessionId, {
            kind: "handoff",
            actorLogin: login,
            entryId: handoffId,
            idempotencyKey: handoffId,
            from,
            to: agent,
            createdAt: switchedAt,
          }),
        );
      } else if (login) {
        persist(
          conversationClient.command(sessionId, {
            kind: "set-agent",
            actorLogin: login,
            agent,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
    },
    [persist],
  );

  const setSessionCheckpoint = useCallback(
    (sessionId: string, checkpoint: ConversationCheckpoint) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? { ...session, contextCheckpoint: checkpoint }
            : session,
        ),
      );
      const login = actorLogin();
      const session = sessionsRef.current.find((item) => item.id === sessionId);
      if (login) {
        persist(
          conversationClient.command(sessionId, {
            kind: "checkpoint",
            actorLogin: login,
            version: checkpoint.revision,
            throughSeq: checkpoint.throughMessageCount - 1,
            agentEpochId: session?.agentHandoffs?.at(-1)?.id ?? "initial",
            summary: checkpoint.summary,
            sourceHash: checkpoint.sourceFingerprint,
            createdAt: checkpoint.createdAt,
          }),
        );
      }
    },
    [persist],
  );

  return {
    hydrated,
    sessions: orderedSessions,
    activeSession,
    messages,
    persistenceError,
    persistUserMessage,
    setMessages,
    setSessionMessages,
    getSessionMessages: (sessionId) => messagesBySession[sessionId] ?? [],
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    pinSession,
    clearActiveSession,
    setSessionAgent,
    setSessionAgencyAgent,
    setSessionCheckpoint,
  };
}
