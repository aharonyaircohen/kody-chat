/**
 * @fileType utility
 * @domain events
 * @pattern system-event-catalog
 * @ai-summary The hardcoded system-event catalog: every event kody can emit,
 *   with a versioned strict Zod payload schema. Brands cannot add events —
 *   configuration (triggers, analytics) only ever references these names.
 *   Client-safe: no server-only import, so the browser bridge can validate
 *   names/payloads before POSTing.
 */
import { z } from "zod";

const sessionId = z.string().trim().min(1);

/** One catalog entry: schema version + strict payload schema. */
export interface SystemEventDefinition<
  S extends z.ZodType<Record<string, unknown>> = z.ZodType<
    Record<string, unknown>
  >,
> {
  readonly version: number;
  readonly description: string;
  readonly schema: S;
}

function defineEvent<S extends z.ZodType<Record<string, unknown>>>(
  description: string,
  schema: S,
): SystemEventDefinition<S> {
  return { version: 1, description, schema };
}

/**
 * Every system event kody can emit. Names are namespaced `<area>.<verb>`.
 * Adding an event = one entry here (plus emission wiring); payload changes
 * bump `version`.
 */
export const SYSTEM_EVENT_CATALOG = {
  "session.started": defineEvent(
    "A chat session was created.",
    z
      .object({
        sessionId,
        surface: z.enum(["dashboard", "client"]).optional(),
      })
      .strict(),
  ),
  "session.ended": defineEvent(
    "A chat session was deleted or ended.",
    z.object({ sessionId }).strict(),
  ),
  "chat.message.sent": defineEvent(
    "A user message entered the chat pipeline.",
    z
      .object({
        sessionId: sessionId.optional(),
        transport: z.enum(["direct", "engine", "interactive"]),
        messageChars: z.number().int().min(0).optional(),
      })
      .strict(),
  ),
  "chat.response.completed": defineEvent(
    "The model finished responding to a chat turn.",
    z
      .object({
        sessionId: sessionId.optional(),
        model: z.string().optional(),
        durationMs: z.number().int().min(0).optional(),
        inputTokens: z.number().int().min(0).optional(),
        outputTokens: z.number().int().min(0).optional(),
        finishReason: z.string().optional(),
      })
      .strict(),
  ),
  "ui.view.shown": defineEvent(
    "A rendered view was shown to the user.",
    z
      .object({
        viewId: z.string().optional(),
        renderer: z.string().optional(),
        sessionId: sessionId.optional(),
      })
      .strict(),
  ),
  "ui.form.submitted": defineEvent(
    "The user submitted a form inside a rendered view.",
    z
      .object({
        viewId: z.string().optional(),
        fields: z.array(z.string()).max(100).default([]),
        sessionId: sessionId.optional(),
      })
      .strict(),
  ),
  "ui.action.clicked": defineEvent(
    "The user clicked an action inside a rendered view.",
    z
      .object({
        viewId: z.string().optional(),
        actionId: z.string().optional(),
        sessionId: sessionId.optional(),
      })
      .strict(),
  ),
  "auth.signed_in": defineEvent(
    "A user signed in.",
    z
      .object({
        kind: z.enum(["operator", "client"]),
        provider: z.string().optional(),
      })
      .strict(),
  ),
  "auth.signed_out": defineEvent(
    "A user signed out.",
    z.object({ kind: z.enum(["operator", "client"]) }).strict(),
  ),
  "page.viewed": defineEvent(
    "The user navigated to a page.",
    z
      .object({
        path: z.string().trim().min(1).max(500),
        referrerPath: z.string().max(500).optional(),
      })
      .strict(),
  ),
  "model.save.proposed": defineEvent(
    "The model proposed saving user state.",
    z
      .object({
        namespace: z.string(),
        keys: z.array(z.string()).max(100),
        sessionId: sessionId.optional(),
      })
      .strict(),
  ),
  "state.entity.written": defineEvent(
    "A user-state namespace was written. Data values are intentionally " +
      "excluded — consumers read state through the user-state API.",
    z
      .object({
        namespace: z.string(),
        namespaceVersion: z.number().int().min(1),
        keys: z.array(z.string()).max(100),
        source: z.enum(["server", "client", "model", "system"]),
      })
      .strict(),
  ),
  "system.error": defineEvent(
    "An unexpected server-side error occurred.",
    z
      .object({
        area: z.string(),
        message: z.string().max(2000),
        sessionId: sessionId.optional(),
      })
      .strict(),
  ),
} as const;

export type SystemEventName = keyof typeof SYSTEM_EVENT_CATALOG;

export type SystemEventPayload<N extends SystemEventName> = z.input<
  (typeof SYSTEM_EVENT_CATALOG)[N]["schema"]
>;

export const SYSTEM_EVENT_NAMES = Object.keys(
  SYSTEM_EVENT_CATALOG,
) as SystemEventName[];

export function isSystemEventName(value: string): value is SystemEventName {
  return Object.prototype.hasOwnProperty.call(SYSTEM_EVENT_CATALOG, value);
}
