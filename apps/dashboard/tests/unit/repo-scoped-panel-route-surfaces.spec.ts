import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
// Panels that moved to @kody-ade/kody-chat are read from the package copy.
const PACKAGE_COMPONENTS = new Set([
  "SecretsManager.tsx",
  "CommandsManager.tsx",
  "ModelsManager.tsx",
  "MemoryManager.tsx",
  "ContextControl.tsx",
  "BrandsManager.tsx",
  "InstructionsManager.tsx",
]);
const componentsRoot = (file: string) =>
  PACKAGE_COMPONENTS.has(file)
    ? "node_modules/@kody-ade/kody-chat/src/dashboard/lib/components"
    : "src/dashboard/lib/components";
const component = (file: string) => read(join(componentsRoot(file), file));
const sourceFile = (file: string) =>
  read(
    file.startsWith("src/") || file.startsWith("node_modules/")
      ? file
      : join(componentsRoot(file), file),
  );

const directRepoOwnedLinkHref =
  /<Link(?:\s|>)[\s\S]{0,240}href="\/(?:activity|agent-goals|agent-loops|capabilities|commands|config|context|docs|memory|messages|models|notifications|preview|reports|runner|secrets|tasks|variables)(?:\/|")/;

describe("repo-scoped panel route surfaces", () => {
  it("has reusable client primitives for scoped links and imperative navigation", () => {
    const hookPath = join(
      process.cwd(),
      "src/dashboard/lib/hooks/useRepoScopedHref.ts",
    );
    const linkPath = join(
      process.cwd(),
      "src/dashboard/lib/components/RepoScopedLink.tsx",
    );

    expect(existsSync(hookPath)).toBe(true);
    expect(existsSync(linkPath)).toBe(true);
    expect(read("src/dashboard/lib/hooks/useRepoScopedHref.ts")).toContain(
      "repoScopedHref",
    );
    expect(read("src/dashboard/lib/components/RepoScopedLink.tsx")).toContain(
      "useRepoScopedHref",
    );
  });

  it("does not render direct repo-owned href literals in panel components", () => {
    for (const file of [
      "DashboardHome.tsx",
      "InboxList.tsx",
      "VaultLockedBanner.tsx",
      "src/dashboard/lib/push/PushCard.tsx",
      "SecretsManager.tsx",
      "CommandsManager.tsx",
      "ModelsManager.tsx",
      "CompanyIntentsView.tsx",
      "VariablesManager.tsx",
      "node_modules/@kody-ade/kody-chat/src/dashboard/lib/chat/plugins/commands/SlashCommandMenu.tsx",
      "OperatorsWarningBanner.tsx",
      "RunnerManager.tsx",
      "NotificationsManager.tsx",
      "ManagedModelsView.tsx",
    ]) {
      expect(sourceFile(file), file).not.toMatch(directRepoOwnedLinkHref);
    }
  });

  it("uses scoped imperative navigation for selection reset routes", () => {
    for (const file of [
      "MemoryManager.tsx",
      "AgentsControl.tsx",
      "ContextControl.tsx",
      "DocsView.tsx",
      "CompanyIntentsView.tsx",
      "PreviewWorkspace.tsx",
      "MessagesView.tsx",
      "TodoControl.tsx",
    ]) {
      const source = component(file);
      expect(source, file).toContain("useRepoScopedHref");
      expect(source, file).not.toMatch(
        /router\.(?:push|replace)\("\/(?:agents|company-intents|context|docs|memory|messages|preview)?\"\)/,
      );
    }
  });

  it("keeps static docs back links scoped through the shared link primitive", () => {
    for (const path of [
      "app/(chat-rail)/commands/docs/page.tsx",
      "app/(chat-rail)/notifications/docs/page.tsx",
      "app/(chat-rail)/notifications/push-docs/page.tsx",
      "app/(chat-rail)/secrets/docs/page.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("RepoScopedLink");
      expect(source, path).not.toMatch(directRepoOwnedLinkHref);
    }
  });
});
