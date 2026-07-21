# Kody Chat

Embeddable React chat with host-owned transport, persistence, context, and
navigation. Kody Chat does not ship a model provider, server credentials, or
Dashboard routes.

## Install

```bash
npm install @kody-ade/kody-chat react react-dom
```

React 18 and 19 are supported. Import the stylesheet once in your application.

## Minimal setup

```tsx
import { KodyChat, type KodyChatHost } from "@kody-ade/kody-chat";
import "@kody-ade/kody-chat/styles.css";

const host: KodyChatHost = {
  transport: {
    async send(input, { signal, emit }) {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok) throw new Error(await response.text());
      emit({ type: "text-replace", text: await response.text() });
      emit({ type: "done" });
    },
  },
};

export function App() {
  return <KodyChat host={host} title="Support" />;
}
```

The server route authenticates the user, authorizes tools, and talks to the
model provider. Never put provider keys or privileged tool implementations in
the browser-side host object.

## Host interface

`transport.send` is the only required callback. It receives the user message,
prior history, optional host context, an `AbortSignal`, and an event emitter.
Supported events are text deltas, text replacement, navigation, visible errors,
and completion. Unknown future events are ignored for forward compatibility.

Optional host callbacks:

- `loadConversation` and `saveConversation` persist and restore messages.
- `getContext` adds safe application context to each turn.
- `uploadAttachment` converts a browser `File` into a host-owned attachment
  reference. Upload bytes and authorization remain the host's responsibility.
- `navigate` handles navigation requests without coupling chat to a router.
- `plugins` observe transport events for analytics or host effects.
- `onError` receives transport, persistence, hydration, and upload failures.

## Streaming and cancellation

Emit `text-delta` repeatedly for streaming or `text-replace` for a final body.
The Stop button aborts the signal and calls the optional
`transport.cancel(conversationId)` hook. A later message can be sent normally
after cancellation or failure.

## Persistence

Persistence is deliberately adapter-based:

```ts
const host = {
  conversationId: "support-123",
  loadConversation: (id) => database.load(id),
  saveConversation: (id, messages) => database.save(id, messages),
  transport,
};
```

For server databases, expose authenticated application routes; do not connect a
browser directly with administrative credentials.

## Attachments

Provide `uploadAttachment` to show the attachment control. The returned
metadata is included on the next user message. The host decides storage,
accepted media types, size limits, malware scanning, retention, and signed URL
policy.

## Plugins

Plugins are small event observers:

```ts
const auditPlugin = {
  id: "audit",
  onEvent(event, { conversationId }) {
    analytics.record(conversationId, event.type);
  },
};
```

Pass them as `host.plugins`. Privileged server tools are not client plugins.

## Styling

The default stylesheet uses `kody-chat` class names and includes a responsive
mobile layout. Override those selectors after importing `styles.css`, or pass a
`className` to scope host-specific theme rules.

## Errors and security

Thrown transport errors become visible assistant error messages and are sent to
`onError`. Authentication and authorization failures should use the same path;
do not silently convert them into successful replies. The host server must
validate identity, conversation access, attachments, context, navigation
targets, and tool requests independently of browser input.

## Public imports

- `@kody-ade/kody-chat`
- `@kody-ade/kody-chat/react`
- `@kody-ade/kody-chat/core`
- `@kody-ade/kody-chat/styles.css`

Other paths are private. Before 1.0, breaking prerelease changes are called out
in release notes. Stable releases follow semantic versioning.

## Troubleshooting

- If styles are missing, import `@kody-ade/kody-chat/styles.css` once.
- Keep the `host` object referentially stable with `useMemo` when it is created
  inside a component.
- If Stop has no server effect, handle the supplied `AbortSignal` or implement
  `transport.cancel`.
- If restored messages disappear, verify that `conversationId` is stable and
  that the persistence callbacks reject errors instead of swallowing them.
