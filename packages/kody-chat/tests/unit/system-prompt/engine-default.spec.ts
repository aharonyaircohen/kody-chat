/**
 * Pins the engine default system prompt's question-asking behavior.
 * Regression guard: the old "Clarify before you act" hard rule told the
 * engine to ask as many clarifying questions as it wanted and stop, which
 * made chats feel like interrogations. The rule is now conditional — ask
 * only when the answer would change what the engine does.
 */

import { describe, expect, it } from "vitest";
import { ENGINE_DEFAULT_SYSTEM_PROMPT } from "@dashboard/lib/system-prompt/engine-default";

describe("engine default system prompt", () => {
  it("keeps clarifying questions conditional, not mandatory (regression: over-asking)", () => {
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).toContain(
      "only when the answer would change what you do",
    );
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).toContain(
      "state your assumption in one line and proceed",
    );
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).not.toContain(
      "Ask as many as you genuinely need",
    );
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).not.toContain(
      "Clarify before you act (HARD RULE)",
    );
  });

  it("still requires a go-ahead before mutating work", () => {
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).toContain(
      "# Answer first, act second (HARD RULE)",
    );
    expect(ENGINE_DEFAULT_SYSTEM_PROMPT).toContain(
      "stop for the user's go-ahead",
    );
  });
});
