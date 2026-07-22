import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { KodyChat } from "@kody-ade/kody-chat";
import "@kody-ade/kody-chat/styles.css";

const CATALOG_KEY = "kody-chat-example:catalog";
const MESSAGE_PREFIX = "kody-chat-example:messages:";
const DEFAULT_CONVERSATION = { id: "welcome", title: "Welcome" };

function readJson(key, fallback) {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : fallback;
}

function readCatalog() {
  return readJson(CATALOG_KEY, [DEFAULT_CONVERSATION]);
}

function saveCatalog(conversations) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(conversations));
}

const conversationHost = {
  async list() {
    return readCatalog();
  },
  async create() {
    const conversation = {
      id: `conversation-${crypto.randomUUID()}`,
      title: "New conversation",
    };
    saveCatalog([...readCatalog(), conversation]);
    return conversation;
  },
  async rename(conversationId, title) {
    saveCatalog(
      readCatalog().map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title }
          : conversation,
      ),
    );
  },
  async remove(conversationId) {
    saveCatalog(
      readCatalog().filter(
        (conversation) => conversation.id !== conversationId,
      ),
    );
    localStorage.removeItem(`${MESSAGE_PREFIX}${conversationId}`);
  },
  async load(conversationId) {
    return readJson(`${MESSAGE_PREFIX}${conversationId}`, []);
  },
  async save(conversationId, messages) {
    localStorage.setItem(
      `${MESSAGE_PREFIX}${conversationId}`,
      JSON.stringify(messages),
    );
  },
};

async function streamReply(text, signal, emit) {
  for (const word of text.split(" ")) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 30));
    emit({ type: "text-delta", text: `${word} ` });
  }
  emit({ type: "done" });
}

function App() {
  const [status, setStatus] = useState("Ready");
  const host = useMemo(
    () => ({
      conversationId: DEFAULT_CONVERSATION.id,
      conversations: conversationHost,
      getContext: () => ({ page: "standalone-example" }),
      uploadAttachment: async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        mediaType: file.type,
        size: file.size,
      }),
      navigate: (href) => setStatus(`Navigation requested: ${href}`),
      plugins: [
        {
          id: "example-events",
          onEvent: (event) => setStatus(`Last event: ${event.type}`),
        },
      ],
      transport: {
        async send(input, { signal, emit }) {
          const reply = input.message.attachments?.length
            ? `Received ${input.message.attachments[0].name}`
            : `External host reply: ${input.message.content}`;
          await streamReply(reply, signal, emit);
        },
      },
    }),
    [],
  );

  return (
    <section className="example-shell">
      <header>
        <h1>Standalone Kody Chat</h1>
        <p>This app depends only on the published package and React.</p>
      </header>
      <KodyChat host={host} title="Example chat" />
      <output className="example-status" data-testid="host-status">
        {status}
      </output>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
