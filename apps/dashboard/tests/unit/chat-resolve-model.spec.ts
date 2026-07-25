import { describe, expect, it } from "vitest";

import { resolveChatModel as dashboardResolveChatModel } from "../../app/api/kody/chat/resolve-model";
import { resolveChatModel as packageResolveChatModel } from "@kody-ade/kody-chat-dashboard/chat/resolve-model";

describe("Dashboard chat model resolution boundary", () => {
  it("uses the package-owned resolver mounted by the live chat route", () => {
    expect(dashboardResolveChatModel).toBe(packageResolveChatModel);
  });
});
