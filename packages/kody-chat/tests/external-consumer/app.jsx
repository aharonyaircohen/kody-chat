import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { KodyChat } from "@kody-ade/kody-chat";
import "@kody-ade/kody-chat/styles.css";

const STORAGE_KEY = "external-kody-chat";

const host = {
  conversationId: "external-demo",
  async loadConversation() {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  },
  async saveConversation(_conversationId, messages) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  },
  getContext() {
    return { surface: "external-demo" };
  },
  async uploadAttachment(file) {
    return {
      id: `attachment-${file.name}`,
      name: file.name,
      mediaType: file.type,
      size: file.size,
    };
  },
  transport: {
    async send(input, { signal, emit }) {
      if (input.message.content === "fail") {
        throw new Error("External transport failed");
      }
      if (input.message.content === "navigate") {
        emit({ type: "navigate", href: "/external/help" });
      }
      if (input.message.content === "unauthorized") {
        const response = await fetch("/api/private");
        throw new Error(await response.text());
      }
      const reply = input.message.attachments?.length
        ? `Attachment received in ${input.conversationId}`
        : input.message.content === "context"
          ? `Context: ${input.context?.surface}`
          : input.message.content === "slow"
            ? "This reply should be cancelled"
            : "Hello from external host";
      for (const word of reply.split(" ")) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 35);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Cancelled", "AbortError"));
            },
            { once: true },
          );
        });
        emit({ type: "text-delta", text: `${word} ` });
      }
      emit({ type: "done" });
    },
  },
};

function App() {
  const [navigation, setNavigation] = useState("");
  const [pluginEvent, setPluginEvent] = useState("");
  const connectedHost = useMemo(
    () => ({
      ...host,
      navigate: setNavigation,
      plugins: [
        {
          id: "external-audit",
          onEvent(event) {
            setPluginEvent(event.type);
          },
        },
      ],
    }),
    [],
  );
  return (
    <>
      <KodyChat host={connectedHost} title="External Kody Chat" />
      <output data-testid="navigation-result">{navigation}</output>
      <output data-testid="plugin-event">{pluginEvent}</output>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
