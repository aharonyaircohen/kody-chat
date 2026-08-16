/**
 * Ordered model fallback for the explicit Automatic chat selection.
 * A switch is allowed only for a rate-limit error before semantic output;
 * authentication, configuration, tool, and mid-stream failures stay visible.
 */
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";

export interface AutomaticLanguageModelCandidate {
  id: string;
  model: LanguageModelV3;
}

export interface AutomaticFallbackEvent {
  from: string;
  to: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function isRateLimitError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    const item = record(current);
    const status = item?.statusCode ?? item?.status;
    if (status === 429 || status === "429") return true;
    const type = `${item?.type ?? ""} ${item?.code ?? ""}`.toLowerCase();
    if (/rate[_ -]?limit|too[_ -]?many[_ -]?requests/.test(type)) return true;
    const message =
      current instanceof Error
        ? current.message
        : typeof current === "string"
          ? current
          : typeof item?.message === "string"
            ? item.message
            : "";
    if (
      /\b429\b|rate[ -]?limit(?:ed| exceeded)?|too many requests/i.test(message)
    ) {
      return true;
    }
    current = item?.cause;
  }
  return false;
}

function startsSemanticOutput(part: LanguageModelV3StreamPart): boolean {
  return !["stream-start", "response-metadata", "raw"].includes(part.type);
}

function replayStream(
  buffered: LanguageModelV3StreamPart[],
  reader: ReadableStreamDefaultReader<LanguageModelV3StreamPart>,
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream<LanguageModelV3StreamPart>({
    async start(controller) {
      try {
        for (const part of buffered) controller.enqueue(part);
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          controller.enqueue(next.value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

async function openAutomaticStream(
  candidates: readonly AutomaticLanguageModelCandidate[],
  options: LanguageModelV3CallOptions,
  onFallback?: (event: AutomaticFallbackEvent) => void,
): Promise<LanguageModelV3StreamResult> {
  let lastThrown: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const nextCandidate = candidates[index + 1];
    let result: LanguageModelV3StreamResult;
    try {
      result = await candidate.model.doStream(options);
    } catch (error) {
      lastThrown = error;
      if (!nextCandidate || !isRateLimitError(error)) throw error;
      onFallback?.({ from: candidate.id, to: nextCandidate.id });
      continue;
    }

    const reader = result.stream.getReader();
    const buffered: LanguageModelV3StreamPart[] = [];
    while (true) {
      let next: ReadableStreamReadResult<LanguageModelV3StreamPart>;
      try {
        next = await reader.read();
      } catch (error) {
        lastThrown = error;
        if (!nextCandidate || !isRateLimitError(error)) {
          reader.releaseLock();
          throw error;
        }
        await reader.cancel(error).catch(() => undefined);
        reader.releaseLock();
        onFallback?.({ from: candidate.id, to: nextCandidate.id });
        break;
      }
      if (next.done) {
        return { ...result, stream: replayStream(buffered, reader) };
      }
      buffered.push(next.value);
      if (next.value.type === "error") {
        if (nextCandidate && isRateLimitError(next.value.error)) {
          await reader.cancel(next.value.error).catch(() => undefined);
          reader.releaseLock();
          onFallback?.({ from: candidate.id, to: nextCandidate.id });
          break;
        }
        return { ...result, stream: replayStream(buffered, reader) };
      }
      if (startsSemanticOutput(next.value)) {
        return { ...result, stream: replayStream(buffered, reader) };
      }
    }
  }
  throw lastThrown ?? new Error("Automatic has no available models");
}

export function createAutomaticLanguageModel(
  candidates: readonly AutomaticLanguageModelCandidate[],
  options: {
    onFallback?: (event: AutomaticFallbackEvent) => void;
  } = {},
): LanguageModelV3 {
  if (candidates.length < 2) {
    throw new Error("Automatic requires at least two enabled models");
  }
  return {
    specificationVersion: "v3",
    provider: "kody.automatic",
    modelId: "automatic",
    supportedUrls: {},
    async doGenerate(callOptions) {
      let lastError: unknown;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const nextCandidate = candidates[index + 1];
        try {
          return await candidate.model.doGenerate(callOptions);
        } catch (error) {
          lastError = error;
          if (!nextCandidate || !isRateLimitError(error)) throw error;
          options.onFallback?.({
            from: candidate.id,
            to: nextCandidate.id,
          });
        }
      }
      throw lastError ?? new Error("Automatic has no available models");
    },
    doStream(callOptions) {
      return openAutomaticStream(candidates, callOptions, options.onFallback);
    },
  };
}
