import React from "react";
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
  transport: {
    async send(input, { signal, emit }) {
      const reply =
        input.message.content === "slow"
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

createRoot(document.getElementById("root")).render(
  <KodyChat host={host} title="External Kody Chat" />,
);
