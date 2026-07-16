/**
 * @fileType hook
 * @domain kody
 * @pattern kody-chat-pending-ref
 * @ai-summary Synchronous ref/consume pair used by plugin hand-off paths.
 *   The plugin's send middleware writes to the ref DURING runSendMiddleware;
 *   sendMessage reads it via `consume()` right after the chain returns and
 *   then resets it to null. Both halves are stable identities so they can
 *   be passed into composer handlers / effect payloads without churn.
 */

import { useCallback, useRef, type MutableRefObject } from "react";

export function usePendingRef<T>(): readonly [
  MutableRefObject<T | null>,
  () => T | null,
] {
  const ref = useRef<T | null>(null);
  const consume = useCallback((): T | null => {
    const v = ref.current;
    ref.current = null;
    return v;
  }, []);
  return [ref, consume] as const;
}
