/**
 * @fileType util
 * @domain view-renderers
 * @pattern renderer-intent-routing
 * @ai-summary Decides when a chat turn should end with a user-managed renderer.
 */
import type { ViewRendererDefinition } from "./renderers";

const RENDERER_INTENT_STOP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "as",
  "available",
  "data",
  "from",
  "in",
  "is",
  "it",
  "item",
  "keys",
  "kody",
  "list",
  "me",
  "one",
  "optional",
  "purpose",
  "the",
  "to",
  "use",
  "user",
  "when",
]);

function tokenStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (raw.length < 2 || RENDERER_INTENT_STOP_WORDS.has(raw)) continue;
    stems.add(raw);
    if (raw.endsWith("ies") && raw.length > 4) {
      stems.add(`${raw.slice(0, -3)}y`);
    }
    if (raw.endsWith("ion") && raw.length > 5) {
      stems.add(raw.slice(0, -3));
    }
    if (raw.endsWith("ing") && raw.length > 5) {
      stems.add(raw.slice(0, -3));
    }
    if (raw.endsWith("ed") && raw.length > 4) {
      stems.add(raw.slice(0, -2));
    }
    if (raw.endsWith("s") && raw.length > 3) {
      stems.add(raw.slice(0, -1));
    }
  }
  return stems;
}

function rendererIntentText(definition: ViewRendererDefinition): string {
  return [
    definition.slug,
    definition.name,
    definition.description,
    definition.purpose,
    ...(definition.aliases ?? []),
    definition.rule,
    ...definition.blocks.flatMap((block) => [block.type, block.bind]),
    ...Object.entries(definition.data ?? {}).flatMap(([key, field]) => [
      key,
      field.type,
      field.description,
    ]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function shouldRequireViewOutputForTurn({
  userText,
  definitions,
}: {
  userText: string | null | undefined;
  definitions: readonly ViewRendererDefinition[];
}): boolean {
  const userStems = tokenStems(userText ?? "");
  if (userStems.size === 0 || definitions.length === 0) return false;
  const rendererStems = tokenStems(
    definitions.map(rendererIntentText).join(" "),
  );
  for (const stem of userStems) {
    if (rendererStems.has(stem)) return true;
  }
  return false;
}

function isReadLikeToolName(toolName: string): boolean {
  return /^(list|read|get|search|fetch|describe)_/.test(toolName);
}

export function shouldAllowPreRenderToolCallsForTurn({
  userText,
  toolNames,
}: {
  userText: string | null | undefined;
  toolNames: Iterable<string>;
}): boolean {
  const userStems = tokenStems(userText ?? "");
  if (userStems.size === 0) return false;
  for (const toolName of toolNames) {
    if (!isReadLikeToolName(toolName)) continue;
    const toolStems = tokenStems(toolName.replace(/_/g, " "));
    for (const stem of userStems) {
      if (toolStems.has(stem)) return true;
    }
  }
  return false;
}
