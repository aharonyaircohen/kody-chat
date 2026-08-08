import { describe, expect, it } from "vitest";

import type { AgentFile } from "../src/agent-files";
import {
  mergeResolvedAgentFiles,
  readResolvedAgentFromSources,
} from "../src/agent-files";
import { listBuiltinAgentFiles } from "../src/builtin-agents";

const agent = (
  slug: string,
  source: "local" | "store",
): AgentFile => ({
  slug,
  title: `${source} ${slug}`,
  body: "test",
  sha: "",
  updatedAt: "2026-08-08T00:00:00.000Z",
  htmlUrl: "",
  source,
  readOnly: source === "store",
});

describe("built-in Agent resolution", () => {
  it("always includes built-ins and lets local definitions override them", () => {
    const result = mergeResolvedAgentFiles({
      local: [agent("kody", "local"), agent("local-only", "local")],
      builtin: listBuiltinAgentFiles(),
      store: [agent("kody", "store"), agent("store-only", "store")],
    });

    expect(result.find(({ slug }) => slug === "kody")?.source).toBe("local");
    expect(result.find(({ slug }) => slug === "agency-architect")?.source).toBe(
      "builtin",
    );
    expect(result.find(({ slug }) => slug === "store-only")?.source).toBe(
      "store",
    );
    expect(result.map(({ slug }) => slug)).not.toContain("kody-store-copy");
  });

  it("resolves local, then built-in, then Store", () => {
    const builtin = listBuiltinAgentFiles();

    expect(
      readResolvedAgentFromSources("kody", [agent("kody", "local")], builtin, [
        agent("kody", "store"),
      ])?.source,
    ).toBe("local");
    expect(
      readResolvedAgentFromSources("kody", [], builtin, [
        agent("kody", "store"),
      ])?.source,
    ).toBe("builtin");
    expect(
      readResolvedAgentFromSources("store-only", [], builtin, [
        agent("store-only", "store"),
      ])?.source,
    ).toBe("store");
  });
});
