# Kody Chat

Kody Chat is an embeddable React chat. The host project owns authentication,
transport, persistence, navigation, models, and tools.

```tsx
import { KodyChat, type KodyChatHost } from "@kody-ade/kody-chat";
import "@kody-ade/kody-chat/styles.css";

const host: KodyChatHost = {
  transport: {
    async send(input, { signal, emit }) {
      const response = await fetch("/api/chat", {
        method: "POST",
        signal,
        body: JSON.stringify(input),
      });
      emit({ type: "text-replace", text: await response.text() });
      emit({ type: "done" });
    },
  },
};

export function App() {
  return <KodyChat host={host} />;
}
```

Provider credentials and privileged tools belong in the host's server route,
never in the browser-side `host` object.
