"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyChatEvent,
  type ChatEvent,
  type ChatMessage,
  type KodyChatHost,
} from "./core";

export interface KodyChatProps {
  host: KodyChatHost;
  initialMessages?: readonly ChatMessage[];
  title?: string;
  placeholder?: string;
  className?: string;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Chat request failed");
}

export function KodyChat({
  host,
  initialMessages = [],
  title = "Chat",
  placeholder = "Write a message",
  className,
}: KodyChatProps) {
  const conversationId = useMemo(
    () => host.conversationId ?? createId(),
    [host.conversationId],
  );
  const [messages, setMessages] = useState<ChatMessage[]>([...initialMessages]);
  const [isHydrated, setIsHydrated] = useState(!host.loadConversation);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!host.loadConversation) {
      setIsHydrated(true);
      return;
    }
    let cancelled = false;
    setIsHydrated(false);
    void host
      .loadConversation(conversationId)
      .then((loaded) => {
        if (!cancelled) {
          setMessages([...loaded]);
          setIsHydrated(true);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setIsHydrated(true);
          host.onError?.(toError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, host]);

  useEffect(() => {
    if (!isHydrated || !host.saveConversation) return;
    void host
      .saveConversation(conversationId, messages)
      .catch((error: unknown) => host.onError?.(toError(error)));
  }, [conversationId, host, isHydrated, messages]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    host.transport.cancel?.(conversationId);
    setMessages((current) =>
      current.map((message) =>
        message.status === "streaming"
          ? { ...message, status: "cancelled" }
          : message,
      ),
    );
    setIsSending(false);
  }, [conversationId, host.transport]);

  useEffect(() => cancel, [cancel]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage & { role: "user" } = {
      id: createId(),
      role: "user",
      content: text,
      status: "complete",
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      status: "streaming",
    };
    const history = [...messages];
    setMessages([...history, userMessage, assistantMessage]);
    setDraft("");
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const emit = (event: ChatEvent) => {
      if (event.type === "navigate") {
        host.navigate?.(event.href);
        return;
      }
      setMessages((current) =>
        applyChatEvent(current, assistantMessage.id, event),
      );
    };

    try {
      await host.transport.send(
        { conversationId, message: userMessage, history },
        { signal: controller.signal, emit },
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id && message.status === "streaming"
            ? { ...message, status: "complete" }
            : message,
        ),
      );
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const failure = toError(error);
        emit({ type: "error", message: failure.message });
        host.onError?.(failure);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsSending(false);
    }
  }, [conversationId, draft, host, isSending, messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className={["kody-chat", className].filter(Boolean).join(" ")}>
      <header className="kody-chat__header">{title}</header>
      <div className="kody-chat__messages" aria-live="polite">
        {messages.map((message) => (
          <article
            className={`kody-chat__message kody-chat__message--${message.role}`}
            data-status={message.status}
            key={message.id}
          >
            {message.content || (message.status === "streaming" ? "…" : "")}
          </article>
        ))}
      </div>
      <form className="kody-chat__composer" onSubmit={submit}>
        <label className="kody-chat__label" htmlFor={`${conversationId}-input`}>
          Message
        </label>
        <textarea
          id={`${conversationId}-input`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={placeholder}
          rows={2}
          value={draft}
        />
        {isSending ? (
          <button onClick={cancel} type="button">
            Stop
          </button>
        ) : (
          <button disabled={!draft.trim()} type="submit">
            Send
          </button>
        )}
      </form>
    </section>
  );
}
