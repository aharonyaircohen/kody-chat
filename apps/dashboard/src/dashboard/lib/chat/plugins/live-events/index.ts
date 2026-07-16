/**
 * @fileType module
 * @domain kody
 * @pattern chat-plugin
 * @ai-summary The live-events chat plugin: supplies the Convex reactive
 *   chat-event stream as the platform's live transport (capability
 *   "live-transport") when NEXT_PUBLIC_CONVEX_URL is set. Without the env
 *   var the plugin registers inert (no capability, no transport) and the
 *   live runner keeps its interval-polling fallback — the dashboard works
 *   identically without Convex.
 */

import type { ChatPlugin } from "@kody-ade/kody-chat/platform";
import { createConvexChatLiveTransport } from "./convex-live-transport";

/** Build-time constant — identical for every render of this deployment. */
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export const liveEventsChatPlugin: ChatPlugin = CONVEX_URL
  ? {
      id: "live-events",
      capabilities: ["live-transport"],
      liveTransport: createConvexChatLiveTransport(CONVEX_URL),
    }
  : {
      id: "live-events",
      capabilities: [],
    };
