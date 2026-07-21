export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  status?: "streaming" | "complete" | "cancelled" | "error";
}

export interface ChatTurnInput {
  conversationId: string;
  message: ChatMessage & { role: "user" };
  history: readonly ChatMessage[];
}

export type ChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "text-replace"; text: string }
  | { type: "error"; message: string }
  | { type: "navigate"; href: string }
  | { type: "done" };

export interface ChatTransportContext {
  signal: AbortSignal;
  emit: (event: ChatEvent) => void;
}

export interface ChatTransport {
  send(input: ChatTurnInput, context: ChatTransportContext): Promise<void>;
  cancel?(conversationId: string): void;
}

export interface KodyChatHost {
  transport: ChatTransport;
  conversationId?: string;
  loadConversation?: (
    conversationId: string,
  ) => Promise<readonly ChatMessage[]>;
  saveConversation?: (
    conversationId: string,
    messages: readonly ChatMessage[],
  ) => Promise<void>;
  navigate?: (href: string) => void;
  onError?: (error: Error) => void;
}

export function applyChatEvent(
  messages: readonly ChatMessage[],
  assistantMessageId: string,
  event: ChatEvent,
): ChatMessage[] {
  if (event.type === "navigate" || event.type === "done") return [...messages];

  return messages.map((message) => {
    if (message.id !== assistantMessageId) return message;
    if (event.type === "text-delta") {
      return { ...message, content: message.content + event.text };
    }
    if (event.type === "text-replace") {
      return { ...message, content: event.text };
    }
    return { ...message, content: event.message, status: "error" };
  });
}
